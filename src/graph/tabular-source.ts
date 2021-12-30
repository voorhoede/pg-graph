import { GraphBuildContext, GraphToSqlContext } from "./context"
import { createWhereBuilder, WhereBuilder } from "./where-builder"
import { GraphItemTypes, ToSql, toSqlKey } from "./types"

import { createWhereClause, Where } from "./where-clause"
import { createField, Field } from "./field"
import { createValue, Value } from "./value"

import { nodeTypes, n, ValidComparisonSign, JoinType } from "../sql-ast";
import { cte } from "../sql-ast/nodes"

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
    value(jsonProp: string, value: string): Value,
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

type Item = TabularSource | Field | Value | Where;

export type NestedRelationType = 'many' | 'one';

export function createRootTabularSource(options: TabularSourceOptions) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name }) => {
        const alias = ctx.genTableAlias()

        const subCtx = ctx.sub()
        subCtx.table = targetTable
        subCtx.tableAlias = alias;

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
    const hasSubRelations = (items: readonly Item[]) => items.some(item => item.type === GraphItemTypes.TABLE)

    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name: fieldName }) => {
        const alias = ctx.genTableAlias()

        const subCtx = ctx.sub()
        subCtx.tableAlias = alias;
        subCtx.table = targetTable;

        let comparison: nodeTypes.Compare;

        if (relType === 'many') {
            // "childTable.parent_id" = "parentTable".id

            comparison = n.compare(
                n.field(foreignKey ?? guessForeignKey(ctx.table), alias),
                '=',
                n.field('id', ctx.tableAlias)
            )
        } else if (relType === 'one') {
            // "parentTable.child_id" = "childTable".id

            comparison = n.compare(
                n.field(guessForeignKey(targetTable), ctx.tableAlias),
                '=',
                n.field('id', targetTable)
            )
        } else {
            (relType as never)
        }

        if (hasSubRelations(items)) {
            const derivedJoinTable = n.selectStatement()
            derivedJoinTable.source(targetTable, alias)

            itemsToSql(items, derivedJoinTable, subCtx)

            derivedJoinTable.addWhereClause(comparison)

            const derivedAlias = ctx.genTableAlias();

            statement.joins.add(JoinType.LEFT_JOIN_LATERAL, n.derivedTable(derivedJoinTable, derivedAlias), n.identifier.true)

            statement.fields.add(n.funcCall('json_agg', n.allFields(derivedAlias)), fieldName)
        } else {
            /* 
                there are no sub relations so the fields and join can be directly added to 'statement'
                however we have to make sure that those fields are wrapped by a json_agg function call
            */

            statement.joins.add(JoinType.LEFT_JOIN, n.tableRefWithAlias(n.tableRef(targetTable), alias), comparison)

            const subStatement = n.selectStatement()

            itemsToSql(items, subStatement, subCtx)

            subStatement.fields.convertToJsonAgg(n.field('id', alias), fieldName)

            statement.fields.append(subStatement.fields)
        }

        statement.addGroupBy(n.field('id', ctx.tableAlias))
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
                item = createNestedTabularSource({ ctx, name: fieldName, builder }, 'many', foreignKeyOrFn);
            }
            items.push(item)
            return item
        },
        one(fieldName: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name: fieldName, builder: foreignKeyOrFn }, 'one');
            } else {
                item = createNestedTabularSource({ ctx, name: fieldName, builder }, 'one', foreignKeyOrFn);
            }
            items.push(item)
            return item
        },
        where(nameOrBuilder: ((builder: WhereBuilder) => void) | string, sign?: ValidComparisonSign, value?: any) {
            const { builder, result } = createWhereBuilder(ctx)
            if (typeof nameOrBuilder === 'function') {
                nameOrBuilder(builder)
            } else {
                builder(nameOrBuilder, sign, value)
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