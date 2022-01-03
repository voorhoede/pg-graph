import { GraphBuildContext, GraphToSqlContext } from "./context"
import { createWhereBuilder, WhereBuilder } from "./where-builder"
import { GraphItemTypes, ToSql, toSqlKey } from "./types"

import { createWhereClause, Where } from "./where-clause"
import { createField, Field } from "./field"
import { createValue, Value } from "./value"
import { createOrderBy, OrderBy } from "./order-by"

import { nodeTypes, n, ValidComparisonSign, JoinType } from "../sql-ast";
import { cte } from "../sql-ast/nodes"
import { OrderDirection } from "../sql-ast/types"

export type TabularSourceBuilder = (s: TabularSource) => void

export type TabularSource = {
    type: GraphItemTypes.TABLE,
    alias(name: string): TabularSource,
    where(name: string, sign: ValidComparisonSign, value: any): TabularSource,
    where(fn: (builder: WhereBuilder) => void): TabularSource,
    field(name: string): Field,
    value(jsonProp: string, value: any): Value,
    orderBy(name: string, mode?: OrderDirection): TabularSource
} & TabularChain & ToSql

type TabularChain = {
    many(tableOrView: string, foreignKey: string, builder: TabularSourceBuilder): TabularSource,
    many(tableOrView: string, builder: TabularSourceBuilder): TabularSource,
    one(tableOrView: string, foreignKey: string, builder: TabularSourceBuilder): TabularSource,
    one(tableOrView: string, builder: TabularSourceBuilder): TabularSource,
    through(table: string, foreignKey?: string): TabularChain
}

type TabularSourceOptions = {
    ctx: GraphBuildContext,
    name: string,
    builder: TabularSourceBuilder,
}

type TabularSourceToSqlOptions = {
    ctx: GraphToSqlContext,
    targetTable: string,
    name: string,
    statement: nodeTypes.SelectStatement,
    items: readonly Item[],
    through?: Through
};

type Through = {
    table: string,
    foreignKey?: string
}

type Item = TabularSource | Field | Value | Where | OrderBy;

export type NestedRelationType = 'many' | 'one';

function getTabularItemsCount(items: readonly Item[]): number {
    return items.reduce((acc, item) => item.type === GraphItemTypes.TABLE ? (acc + 1) : acc, 0)
}

export function createRootTabularSource(options: TabularSourceOptions) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name }) => {
        const alias = ctx.genTableAlias()

        const subCtx = ctx.createSubContext()
        subCtx.table = targetTable
        subCtx.tableAlias = alias;
        subCtx.subRelationCount = getTabularItemsCount(items)

        // we create a cte that uses json_build_object to build the result
        const cteSelect = n.selectStatement()
        cteSelect.source(targetTable, alias)

        // apply all items to the cteSelect
        itemsToSql(items, cteSelect, subCtx)

        cteSelect.fields.convertToJsonObject('data')

        // todo check if the cte already exists?
        statement.addCte(cte(`${name}Cte`, cteSelect))

        // we use a json_agg with the result of the cte to make sure that we only get one row
        const cteName = `${name}Cte`
        const subSelect = n.selectStatement()
        subSelect.source(cteName)
        subSelect.fields.add(n.funcCall('json_agg', n.field('data', cteName)))

        statement.fields.add(n.subquery(subSelect), name)
    })
}

export function createNestedTabularSource(options: TabularSourceOptions, relType: NestedRelationType, foreignKey?: string, through?: Through) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name }) => {
        const parentTableAlias = ctx.tableAlias!
        const parentTable = ctx.table!
        const targetTableAlias = ctx.genTableAlias()
        const parentSubRelationCount = ctx.subRelationCount

        const subTabularSourceItems = getTabularItemsCount(items)

        const subCtx = ctx.createSubContext()
        subCtx.tableAlias = targetTableAlias;
        subCtx.table = targetTable;
        subCtx.subRelationCount = subTabularSourceItems;

        if (relType === 'many') {
            if (ctx.depth === 1 && !subTabularSourceItems && parentSubRelationCount === 1) {
                /*
                    Aggregrate after join for very simple constructs
                */

                if (through) {
                    const joinAlias = ctx.genTableAlias()

                    statement.joins.add(
                        JoinType.LEFT_JOIN,
                        n.tableRefWithAlias(n.tableRef(through.table), joinAlias),
                        n.compare(
                            n.field(through.foreignKey ?? guessForeignKey(through.table), joinAlias),
                            '=',
                            n.field('id', parentTableAlias),
                        )
                    )

                    statement.joins.add(
                        JoinType.INNER_JOIN,
                        n.tableRefWithAlias(n.tableRef(targetTable), targetTableAlias),
                        n.compare(
                            n.field(guessForeignKey(through.table), targetTableAlias),
                            '=',
                            n.field('id', joinAlias)
                        )
                    )
                } else {
                    statement.joins.add(
                        JoinType.LEFT_JOIN,
                        n.tableRefWithAlias(n.tableRef(targetTable), targetTableAlias),
                        n.compare(
                            n.field(foreignKey ?? guessForeignKey(parentTable), targetTableAlias),
                            '=',
                            n.field('id', parentTableAlias)
                        )
                    )
                }

                const subStatement = n.selectStatement()

                itemsToSql(items, subStatement, subCtx)

                subStatement.convertFieldsToJsonAgg(name, n.field('id', targetTableAlias))

                statement.fields.append(subStatement.fields)

                statement.addGroupBy(n.field('id', parentTableAlias))
            } else {
                /*
                    Aggregrate before join for complex constructs where we are nested a couple of levels
                */

                const derivedJoinTable = n.selectStatement()
                derivedJoinTable.source(targetTable, targetTableAlias)

                itemsToSql(
                    items,
                    derivedJoinTable,
                    subCtx
                )

                derivedJoinTable.convertFieldsToJsonAgg('data')

                let foreignField: nodeTypes.TableFieldRef
                if (through) {
                    const joinAlias = ctx.genTableAlias()

                    foreignField = n.field('id', joinAlias)

                    derivedJoinTable.joins.add(
                        JoinType.INNER_JOIN,
                        n.tableRefWithAlias(n.tableRef(through.table), joinAlias),
                        n.compare(
                            n.field(guessForeignKey(through.table), targetTableAlias),
                            '=',
                            n.field('id', joinAlias),
                        )
                    )
                } else {
                    foreignField = n.field(foreignKey ?? guessForeignKey(parentTable), targetTableAlias)
                }

                derivedJoinTable.fields.add(foreignField, 'group')
                derivedJoinTable.addGroupBy(foreignField)

                const derivedAlias = ctx.genTableAlias();

                statement.joins.add(
                    JoinType.LEFT_JOIN,
                    n.derivedTable(derivedJoinTable, derivedAlias),
                    n.compare(
                        n.field('group', derivedAlias),
                        '=',
                        n.field('id', parentTableAlias)
                    )
                )

                statement.fields.add(n.field('data', derivedAlias), name)
            }
        } else if (relType === 'one') {
            /*
                One to one relation
            */

            const subStatement = n.selectStatement()

            itemsToSql(items, subStatement, subCtx)

            subStatement.convertFieldsToJsonObject(name)

            if (through) {
                const joinAlias = ctx.genTableAlias()

                statement.joins.add(
                    JoinType.LEFT_JOIN,
                    n.tableRefWithAlias(n.tableRef(through.table), joinAlias),
                    n.compare(
                        n.field(through.foreignKey ?? guessForeignKey(through.table), parentTableAlias),
                        '=',
                        n.field('id', joinAlias),
                    )
                )

                statement.joins.add(
                    JoinType.INNER_JOIN,
                    n.tableRefWithAlias(n.tableRef(targetTable), targetTableAlias),
                    n.compare(
                        n.field('id', targetTableAlias),
                        '=',
                        n.field(foreignKey ?? guessForeignKey(targetTable), joinAlias)
                    )
                )
            } else {
                statement.joins.add(
                    JoinType.LEFT_JOIN,
                    n.tableRefWithAlias(n.tableRef(targetTable), targetTableAlias),
                    n.compare(
                        n.field(foreignKey ?? guessForeignKey(parentTable), parentTableAlias),
                        '=',
                        n.field('id', targetTableAlias)
                    )
                )
            }

            statement.fields.append(subStatement.fields)

        } else {
            (relType as never)
        }


    })
}

function createThroughChain({ ctx, initialThrough, items }: { ctx: GraphBuildContext, initialThrough: Through, items: Item[] }): TabularChain {
    const throughs: Through[] = [initialThrough]

    return {
        through(table: string, foreignKey?: string) {
            throughs.push({
                table,
                foreignKey,
            })
            return this
        },
        many(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, 'many', undefined, throughs[0]);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, 'many', foreignKeyOrFn, throughs[0]);
            }
            items.push(item)
            return item
        },
        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, 'one', undefined, throughs[0]);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, 'one', foreignKeyOrFn, throughs[0]);
            }
            items.push(item)
            return item
        }
    }
}

function createBaseTabularSource({ ctx, name, builder }: TabularSourceOptions, toSql: (options: TabularSourceToSqlOptions) => void) {
    const items: Item[] = []

    let alias: string

    const instance: TabularSource = {
        type: GraphItemTypes.TABLE,
        through(table: string, foreignKey?: string) {
            const initialThrough: Through = {
                table,
                foreignKey,
            }

            return createThroughChain({ ctx, initialThrough, items })
        },
        many(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, 'many');
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, 'many', foreignKeyOrFn);
            }
            items.push(item)
            return item
        },
        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, 'one');
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, 'one', foreignKeyOrFn);
            }
            items.push(item)
            return item
        },
        where(nameOrBuilder: ((builder: WhereBuilder) => void) | string, sign?: ValidComparisonSign, value?: any) {
            const { builder, result } = createWhereBuilder(ctx)
            if (typeof nameOrBuilder === 'function') {
                nameOrBuilder(builder)
            } else {
                builder(nameOrBuilder, sign!, value)
            }
            items.push(createWhereClause(result))
            return this
        },
        alias(name) {
            alias = name;
            return this
        },
        field(name) {
            const fieldItem = createField(name)
            items.push(fieldItem)
            return fieldItem
        },
        value(jsonProp, value) {
            const valueItem = createValue(jsonProp, value, ctx);
            items.push(valueItem)
            return valueItem
        },
        orderBy(name, mode) {
            const orderBy = createOrderBy(name, mode)
            items.push(orderBy)
            return this
        },
        [toSqlKey](statement, ctx) {
            toSql({
                ctx,
                statement,
                targetTable: name,
                name: alias ?? name,
                items,
            })
        }
    }

    builder?.(instance)

    return instance
}

function guessForeignKey(tableName: string) {
    return `${tableName.toLowerCase()}_id`
}

function itemsToSql(items: readonly Item[], statement: nodeTypes.SelectStatement, ctx: GraphToSqlContext) {
    items.forEach(item => item[toSqlKey](statement, ctx))
}