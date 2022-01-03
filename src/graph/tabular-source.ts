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
    many(tableOrView: string, foreignKey: string, builder: TabularSourceBuilder): TabularSource,
    many(tableOrView: string, builder: TabularSourceBuilder): TabularSource,
    one(tableOrView: string, foreignKey: string, builder: TabularSourceBuilder): TabularSource,
    one(tableOrView: string, builder: TabularSourceBuilder): TabularSource,
    targetTable(name: string): TabularSource,
    where(name: string, sign: ValidComparisonSign, value: any): TabularSource,
    where(fn: (builder: WhereBuilder) => void): TabularSource,
    field(name: string): Field,
    value(jsonProp: string, value: any): Value,
    orderBy(name: string, mode?: OrderDirection): TabularSource
} & ToSql

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
    items: readonly Item[]
};

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

export function createNestedTabularSource(options: TabularSourceOptions, relType: NestedRelationType, foreignKey?: string) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name: fieldName }) => {
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
            if (ctx.depth === 2 && !subTabularSourceItems && parentSubRelationCount === 1) {
                /*
                    Aggregrate after join for very simple constructs
                */

                const joinComparison = n.compare(
                    n.field(foreignKey ?? guessForeignKey(parentTable), targetTableAlias),
                    '=',
                    n.field('id', parentTableAlias)
                )

                statement.joins.add(JoinType.LEFT_JOIN, n.tableRefWithAlias(n.tableRef(targetTable), targetTableAlias), joinComparison)

                const subStatement = n.selectStatement()

                itemsToSql(items, subStatement, subCtx)

                subStatement.convertFieldsToJsonAgg(fieldName, n.field('id', targetTableAlias))

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

                const foreignField = n.field(foreignKey ?? guessForeignKey(parentTable), targetTableAlias)

                derivedJoinTable.convertFieldsToJsonAgg('data')
                derivedJoinTable.fields.add(foreignField, 'group')
                derivedJoinTable.addGroupBy(foreignField)

                const derivedAlias = ctx.genTableAlias();

                const joinComparison = n.compare(
                    n.field('group', derivedAlias),
                    '=',
                    n.field('id', parentTableAlias)
                )

                statement.joins.add(JoinType.LEFT_JOIN, n.derivedTable(derivedJoinTable, derivedAlias), joinComparison)

                statement.fields.add(n.field('data', derivedAlias), fieldName)
            }
        } else if (relType === 'one') {
            /*
                One to one relation
            */

            const subStatement = n.selectStatement()

            itemsToSql(items, subStatement, subCtx)

            subStatement.convertFieldsToJsonObject(fieldName)

            const joinComparison = n.compare(
                n.field(foreignKey ?? guessForeignKey(targetTable), parentTableAlias),
                '=',
                n.field('id', targetTableAlias)
            )

            statement.fields.append(subStatement.fields)
            statement.joins.add(JoinType.LEFT_JOIN, n.tableRefWithAlias(n.tableRef(targetTable), targetTableAlias), joinComparison)

        } else {
            (relType as never)
        }


    })
}

function createBaseTabularSource({ ctx, name: fieldName, builder }: TabularSourceOptions, toSql: (options: TabularSourceToSqlOptions) => void) {
    const items: Item[] = []

    let targetTable: string

    const instance: TabularSource = {
        type: GraphItemTypes.TABLE,
        many(fieldName: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name: fieldName, builder: foreignKeyOrFn }, 'many');
            } else {
                item = createNestedTabularSource({ ctx, name: fieldName, builder: builder! }, 'many', foreignKeyOrFn);
            }
            items.push(item)
            return item
        },
        one(fieldName: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name: fieldName, builder: foreignKeyOrFn }, 'one');
            } else {
                item = createNestedTabularSource({ ctx, name: fieldName, builder: builder! }, 'one', foreignKeyOrFn);
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
        targetTable(name) {
            targetTable = name;
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
                targetTable: targetTable ?? fieldName,
                name: fieldName,
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