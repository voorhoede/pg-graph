import { GraphBuildContext, GraphToSqlContext } from "./context"
import { createWhereBuilder, WhereBuilder } from "./where-builder"
import { createAggBuilder, AggBuilder } from "./agg-builder"
import { GraphItemTypes, ToSql, toSqlKey } from "./types"

import { createWhereClause, Where } from "./where-clause"
import { createField, Field } from "./field"
import { createValue, Value } from "./value"
import { createOrderBy, OrderBy } from "./order-by"
import { createAgg, Agg } from './agg'

import { n, ValidComparisonSign, JoinType, json } from "../sql-ast";
import { OrderDirection } from "../sql-ast/types"

export type TabularSourceBuilder = (s: TabularSource) => void

export type TabularSource = {
    type: GraphItemTypes.TABLE,
    agg(builderHandler: (builder: AggBuilder) => void): TabularSource,
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
    throughMany(table: string, foreignKey?: string): TabularChain
    throughOne(table: string, foreignKey?: string): TabularChain
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
    statement: n.SelectStatement,
    items: readonly Item[],
    through?: Through
};

type Through = {
    table: string,
    foreignKey?: string,
    rel: NestedRelationType,
}

type Item = TabularSource | Field | Value | Where | OrderBy | Agg;

export enum NestedRelationType {
    Many,
    One,
}

function getTabularItemsCount(items: readonly Item[]): number {
    return items.reduce((acc, item) => item.type === GraphItemTypes.TABLE ? (acc + 1) : acc, 0)
}

export function createRootTabularSource(options: TabularSourceOptions) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name }) => {
        const alias = ctx.genTableAlias(targetTable)

        const subCtx = ctx.createSubContext()
        subCtx.table = targetTable
        subCtx.tableAlias = alias;
        subCtx.subRelationCount = getTabularItemsCount(items)

        // we create a cte that uses json_build_object to build the result
        const cteSelect = new n.SelectStatement()
        cteSelect.source = new n.TableRefWithAlias(new n.TableRef(targetTable), alias)

        // apply all items to the cteSelect
        itemsToSql(items, cteSelect, subCtx)

        json.convertDataFieldsToAgg(cteSelect)

        if (cteSelect.fields.size === 0) {
            json.convertToEmptyDataStatement(cteSelect)
            return
        }

        // todo check if the cte already exists?
        const cte = new n.Cte(`${name}Cte`, cteSelect)
        statement.ctes.set(cte.name, cte)

        if (!statement.source) {
            statement.source = new n.TableRef(cte.name)
        } else {
            statement.joins.push(new n.Join(JoinType.CROSS_JOIN, new n.TableRef(cte.name)))
        }

        json.addReferencesToChildFields({
            withPrefix: name,
            dest: statement,
            src: cte,
        })
    })
}

function* reversed<T>(items: T[]): Generator<[T, number]> {
    for (let i = items.length - 1, x = 0; i >= 0; i--, x++) {
        yield [items[i], x]
    }
}

function getForeignKey(key: string | null | undefined, orGuessFromTable: string) {
    return key ?? guessForeignKey(orGuessFromTable)
}

function guessForeignKey(tableName: string) {
    return `${tableName.toLowerCase()}_id`
}

export function createNestedTabularSource(options: TabularSourceOptions, relType: NestedRelationType, foreignKey?: string, through?: Through[]) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name }) => {
        const parentTableAlias = ctx.tableAlias!
        const parentTable = ctx.table!
        const targetTableAlias = ctx.genTableAlias(targetTable)

        const subTabularSourceItems = getTabularItemsCount(items)

        const subCtx = ctx.createSubContext()
        subCtx.tableAlias = targetTableAlias;
        subCtx.table = targetTable;
        subCtx.subRelationCount = subTabularSourceItems;

        if (relType === NestedRelationType.Many) {

            /*
                Aggregrate before join for complex constructs where we are nested a couple of levels
            */

            const subStatement = new n.SelectStatement()
            subStatement.source = new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias)

            itemsToSql(
                items,
                subStatement,
                subCtx
            )

            json.convertDataFieldsToAgg(subStatement)

            let groupByField = new n.Column(getForeignKey(foreignKey, parentTable), targetTableAlias)

            if (through?.length) {
                // todo make this a loop

                let prevThroughTableAlias: string | undefined;
                let prevThroughItem: Through | undefined;

                /*
                    We loop through the items in reverse order because that's how the sql joins work.
                    Example: 
                        the 'from' table comes after the through chain but should appear first in the query
                        next comes the table nearest to the 'from' etc
                */
                for (let [throughItem, index] of reversed(through)) {
                    const throughTableAlias = ctx.genTableAlias(throughItem.table)

                    // the first item (last because we loop in reverse) should point to parentTable and is therefore the grouping column
                    if (index === through.length - 1) {
                        groupByField = new n.Column(getForeignKey(throughItem.foreignKey, parentTable), throughTableAlias)
                    }

                    // when the through is many the foreign key is on the through join table
                    // we have to make sure that the join through does not yield more rows than the parentTable otherwise we get duplicate results
                    if (throughItem.rel === NestedRelationType.One) {
                        let foreignColumn: n.Column
                        if (prevThroughItem) {
                            foreignColumn = new n.Column(getForeignKey(throughItem.foreignKey, throughItem.table), prevThroughTableAlias)
                        } else {
                            foreignColumn = new n.Column(getForeignKey(throughItem.foreignKey, throughItem.table), targetTableAlias)
                        }

                        subStatement.joins.push(new n.Join(
                            JoinType.INNER_JOIN,
                            new n.TableRefWithAlias(new n.TableRef(throughItem.table), throughTableAlias),
                            new n.Compare(
                                new n.Column('id', throughTableAlias),
                                '=',
                                foreignColumn,
                            )
                        ))
                    } else if (throughItem.rel === NestedRelationType.Many) {
                        let foreignColumn: n.Column
                        if (prevThroughItem) {
                            foreignColumn = new n.Column(getForeignKey(prevThroughItem.foreignKey, prevThroughItem.table), throughTableAlias)
                        } else {
                            foreignColumn = new n.Column(getForeignKey(foreignKey, targetTable), throughTableAlias)
                        }

                        subStatement.joins.push(new n.Join(
                            JoinType.INNER_JOIN,
                            new n.TableRefWithAlias(new n.TableRef(throughItem.table), throughTableAlias),
                            new n.Compare(
                                new n.Column('id', prevThroughTableAlias ?? targetTableAlias),
                                '=',
                                foreignColumn,
                            )
                        ))
                    } else {
                        (throughItem.rel as never)
                    }

                    prevThroughTableAlias = throughTableAlias
                    prevThroughItem = throughItem
                }

            }

            subStatement.fields.set(json.createHiddenFieldName('group'), groupByField)
            subStatement.groupBys.push(groupByField)

            const derivedAlias = ctx.genTableAlias(targetTable);
            const derivedTable = new n.DerivedTable(subStatement, derivedAlias)

            statement.joins.push(new n.Join(
                JoinType.LEFT_JOIN,
                derivedTable,
                new n.Compare(
                    new n.Column(json.createHiddenFieldName('group'), derivedAlias),
                    '=',
                    new n.Column('id', parentTableAlias)
                )
            ))

            json.addReferencesToChildFields({
                src: derivedTable,
                dest: statement,
                withPrefix: name,
            })
        } else if (relType === NestedRelationType.One) {
            /*
                One to one relation
            */

            const subStatement = new n.SelectStatement()

            itemsToSql(items, subStatement, subCtx)

            if (through?.length) {
                const [source, ...joinedThrough] = through;

                const sourceTableAlias = ctx.genTableAlias(source.table)
                subStatement.source = new n.TableRefWithAlias(new n.TableRef(source.table), sourceTableAlias)
                if (source.rel === NestedRelationType.Many) {
                    subStatement.addWhereClause(
                        new n.Compare(
                            new n.Column(getForeignKey(source.foreignKey, parentTable), sourceTableAlias),
                            '=',
                            new n.Column('id', parentTableAlias),
                        )
                    )
                } else {
                    subStatement.addWhereClause(
                        new n.Compare(
                            new n.Column(getForeignKey(source.foreignKey, source.table), parentTableAlias),
                            '=',
                            new n.Column('id', sourceTableAlias),
                        )
                    )
                }
                subStatement.limit = 1

                let prevThroughTableAlias: string | undefined;
                let prevThroughItem: Through | undefined;

                for (let throughItem of joinedThrough) {
                    const throughTableAlias = ctx.genTableAlias(throughItem.table)

                    // when the through is many the foreign key is on the through join table
                    // we have to make sure that the join through does not yield more rows than the parentTable otherwise we get duplicate results
                    if (throughItem.rel === NestedRelationType.One) {
                        let foreignColumn: n.Column
                        if (prevThroughItem) {
                            foreignColumn = new n.Column(getForeignKey(throughItem.foreignKey, throughItem.table), prevThroughTableAlias)
                        } else {
                            foreignColumn = new n.Column(getForeignKey(throughItem.foreignKey, throughItem.table), sourceTableAlias)
                        }

                        subStatement.joins.push(new n.Join(
                            JoinType.INNER_JOIN,
                            new n.TableRefWithAlias(new n.TableRef(throughItem.table), throughTableAlias),
                            new n.Compare(
                                new n.Column('id', throughTableAlias),
                                '=',
                                foreignColumn,
                            )
                        ))
                    } else if (throughItem.rel === NestedRelationType.Many) {
                        let foreignColumn: n.Column
                        if (prevThroughItem) {
                            foreignColumn = new n.Column(getForeignKey(prevThroughItem.foreignKey, prevThroughItem.table), throughTableAlias)
                        } else {
                            foreignColumn = new n.Column(getForeignKey(throughItem.foreignKey, source.table), throughTableAlias)
                        }

                        subStatement.joins.push(new n.Join(
                            JoinType.INNER_JOIN,
                            new n.TableRefWithAlias(new n.TableRef(throughItem.table), throughTableAlias),
                            new n.Compare(
                                foreignColumn,
                                '=',
                                new n.Column('id', prevThroughTableAlias ?? sourceTableAlias),
                            )
                        ))
                    } else {
                        (throughItem.rel as never)
                    }

                    prevThroughTableAlias = throughTableAlias
                    prevThroughItem = throughItem
                }

                subStatement.joins.push(new n.Join(
                    JoinType.INNER_JOIN,
                    new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias),
                    new n.Compare(
                        new n.Column('id', targetTableAlias),
                        '=',
                        new n.Column(getForeignKey(foreignKey, targetTable), prevThroughTableAlias ?? sourceTableAlias)
                    )
                ))

                const lateralAlias = subCtx.genTableAlias(targetTable)

                statement.joins.push(new n.Join(
                    JoinType.LEFT_JOIN_LATERAL,
                    new n.DerivedTable(subStatement, lateralAlias),
                    n.Identifier.true,
                ))

                json.addField(statement, 'data', name, new n.Column('data', lateralAlias))

            } else {
                statement.joins.push(new n.Join(
                    JoinType.LEFT_JOIN,
                    new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias),
                    new n.Compare(
                        new n.Column(getForeignKey(foreignKey, parentTable), parentTableAlias),
                        '=',
                        new n.Column('id', targetTableAlias)
                    )
                ))

                subStatement.copyWhereClauseTo(statement)

                json.copyFieldsInto(subStatement, statement, 'data', name)
            }

        } else {
            (relType as never)
        }


    })
}

function createThroughChain({ ctx, initialThrough, items }: { ctx: GraphBuildContext, initialThrough: Through, items: Item[] }): TabularChain {
    const throughs: Through[] = [initialThrough]

    return {
        throughMany(table: string, foreignKey?: string) {
            throughs.push({
                table,
                foreignKey,
                rel: NestedRelationType.Many,
            })
            return this
        },
        throughOne(table: string, foreignKey?: string) {
            throughs.push({
                table,
                foreignKey,
                rel: NestedRelationType.One,
            })
            return this
        },
        many(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, NestedRelationType.Many, undefined, throughs);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, NestedRelationType.Many, foreignKeyOrFn, throughs);
            }
            items.push(item)
            return item
        },
        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, NestedRelationType.One, undefined, throughs);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, NestedRelationType.One, foreignKeyOrFn, throughs);
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
        agg(builderHandler: (builder: AggBuilder) => void) {
            const { builder, result } = createAggBuilder(ctx)
            builderHandler(builder)
            items.push(createAgg(result))
            return this
        },
        throughMany(table: string, foreignKey?: string) {
            const initialThrough: Through = {
                table,
                foreignKey,
                rel: NestedRelationType.Many,
            }

            return createThroughChain({ ctx, initialThrough, items })
        },
        throughOne(table: string, foreignKey?: string) {
            const initialThrough: Through = {
                table,
                foreignKey,
                rel: NestedRelationType.One,
            }

            return createThroughChain({ ctx, initialThrough, items })
        },
        many(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, NestedRelationType.Many);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, NestedRelationType.Many, foreignKeyOrFn);
            }
            items.push(item)
            return item
        },
        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, NestedRelationType.One);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, NestedRelationType.One, foreignKeyOrFn);
            }
            items.push(item)
            return item
        },
        where(nameOrBuilderHandler: ((builder: WhereBuilder) => void) | string, sign?: ValidComparisonSign, value?: any) {
            const { builder, result } = createWhereBuilder(ctx)
            if (typeof nameOrBuilderHandler === 'function') {
                nameOrBuilderHandler(builder)
            } else {
                builder(nameOrBuilderHandler, sign!, value)
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

function itemsToSql(items: readonly Item[], statement: n.SelectStatement, ctx: GraphToSqlContext) {
    items.forEach(item => item[toSqlKey](statement, ctx))
}