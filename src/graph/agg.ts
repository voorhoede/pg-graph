import { GraphItemTypes, ToSql, toSqlKey } from "./types"
import { json, n } from "../sql-ast"
import { BuiltinGroups } from "../sql-ast/json-utils"

export type Agg = {
    type: GraphItemTypes.AGG,
} & ToSql

export function createAgg(): Agg {
    return {
        type: GraphItemTypes.AGG,

        [toSqlKey](statement, ctx) {
            json.addField(statement, BuiltinGroups.Agg, 'count', new n.FuncCall('count', new n.Field('id', ctx.tableAlias)))
        }
    }
}