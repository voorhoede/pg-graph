import { GraphBuildContext, GraphToSqlContext } from "./context"
import { createWhereBuilder, WhereBuilder } from "./where-builder"
import { GraphItemTypes, ToSql, toSqlKey } from "./types"

import { createWhereClause, Where } from "./where-clause"
import { createField, Field } from "./field"
import { createValue, Value } from "./value"

import { nodeTypes, n, ValidComparisonSign, JoinType } from "../sql-ast";
import { cte } from "../sql-ast/nodes"

export type TableSourceBuilder = (s: TableSource) => void

export type TableSource = {
    type: GraphItemTypes.TABLE,
    many(tableOrView: string, foreignKey: string, fn: TableSourceBuilder): TableSource,
    many(tableOrView: string, fn: TableSourceBuilder): TableSource,
    // one(tableOrView: string, foreignKey: string, fn: TableSourceBuilder): TableSource,
    // one(tableOrView: string, fn: TableSourceBuilder): TableSource,
    targetTable(name: string): TableSource,
    where(name: string, sign: ValidComparisonSign, value: any): TableSource,
    where(fn: (builder: WhereBuilder) => void): TableSource,
    field(name: string): Field,
    value(jsonProp: string, value: string): Value,
} & ToSql

export function createTableSource(ctx: GraphBuildContext, fieldName: string, foreignKey?: string, fn?: TableSourceBuilder) {
    type Item = TableSource | Field | Value | Where;

    const items: Item[] = []

    let targetTable: string

    const hasSubRelations = () => items.some(child => child.type === GraphItemTypes.TABLE)

    const callToSqlForChilds = (statement: nodeTypes.SelectStatement, ctx: GraphToSqlContext) => {
        items.forEach(child => child[toSqlKey](statement, ctx))
    }

    const guessForeignKey = (ctx: GraphToSqlContext) => {
        return foreignKey ?? `${ctx.table.toLowerCase()}_id`
    }

    const instance: TableSource = {
        type: GraphItemTypes.TABLE,
        many(fieldName: string, foreignKeyOrFn: TableSourceBuilder | string, fn?: TableSourceBuilder): TableSource {
            let item: TableSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createTableSource(ctx, fieldName, undefined, foreignKeyOrFn);
            } else {
                item = createTableSource(ctx, fieldName, foreignKeyOrFn, fn);
            }
            items.push(item)
            return item
        },

        /* 
            TODO: implement support for a one-to-one relation

            Should do the following things

            - use a different foreign key (source table)
            - enforce single item or return null
        */

        // one(fieldName: string, foreignKeyOrFn: TableSourceBuilder | string, fn?: TableSourceBuilder): TableSource {
        //     let item: TableSource;
        //     if (typeof foreignKeyOrFn === 'function') {
        //         item = createTableSource(ctx, fieldName, undefined, foreignKeyOrFn);
        //     } else {
        //         item = createTableSource(ctx, fieldName, foreignKeyOrFn, fn);
        //     }
        //     items.push(item)
        //     return item 
        // },
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
            const field = createField(name)
            items.push(field)
            return field
        },
        value(jsonProp, value) {
            const v = createValue(jsonProp, value, ctx);
            items.push(v)
            return v
        },
        [toSqlKey](statement, ctx) {
            const table = targetTable ?? fieldName;

            if (ctx.table) { // join
                const alias = ctx.genTableAlias()

                const subCtx = ctx.sub()
                subCtx.tableAlias = alias;
                subCtx.table = table;

                const comparison = n.compare(n.tableField(alias, guessForeignKey(ctx)), '=', n.tableField(ctx.tableAlias, 'id'))

                if (hasSubRelations()) {
                    const derivedJoinTable = n.selectStatement()
                    derivedJoinTable.source(n.tableRef(table), alias)

                    callToSqlForChilds(derivedJoinTable, subCtx)

                    derivedJoinTable.addWhereClause(comparison)

                    const derivedAlias = ctx.genTableAlias();

                    statement.joins.add(JoinType.LEFT_JOIN_LATERAL, n.derivedTable(derivedJoinTable, derivedAlias), n.identifier.true)

                    statement.fields.add(n.funcCall('json_agg', n.tableAllFields(derivedAlias)), fieldName)
                } else {
                    /* 
                        there are no sub relations so the fields and join can be directly added to 'statement'
                        however we have to make sure that those fields are wrapped by a json_agg function call
                    */

                    statement.joins.add(JoinType.LEFT_JOIN, n.tableRefWithAlias(n.tableRef(table), alias), comparison)

                    const subStatement = n.selectStatement()

                    callToSqlForChilds(subStatement, subCtx)

                    subStatement.fields.convertToJsonAgg(n.tableField(alias, 'id'), fieldName)

                    statement.fields.append(subStatement.fields)
                }

                statement.addGroupBy(n.tableField(ctx.tableAlias, 'id'))

            } else { // root select
                const alias = ctx.genTableAlias()

                const subCtx = ctx.sub()
                subCtx.table = table;
                subCtx.tableAlias = alias;

                // we create a cte that uses json_build_object to build the result
                const cteSelect = n.selectStatement()
                cteSelect.source(n.tableRef(table), alias)

                callToSqlForChilds(cteSelect, subCtx)

                cteSelect.fields.convertToJsonObject('data')

                statement.addCte(cte(`${fieldName}Cte`, cteSelect))

                // we use a json_agg with the result of the cte to make sure that we only get one row
                const subSelect = n.selectStatement()
                subSelect.source(n.tableRef(`${fieldName}Cte`))
                subSelect.fields.add(n.funcCall('json_agg', n.tableField(`${fieldName}Cte`, 'data')))

                statement.fields.add(n.subquery(subSelect), fieldName)
            }
        }
    }

    fn?.(instance)

    return instance
}