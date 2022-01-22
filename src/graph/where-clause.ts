import { WhereBuilderResult } from "./where-builder"
import { GraphItemTypes, ToSql, toSqlKey } from "./types"

export type Where = {
    type: GraphItemTypes.WHERE,
} & ToSql

export function createWhereClause(builderResult: WhereBuilderResult): Where {
    return {
        type: GraphItemTypes.WHERE,

        [toSqlKey](statement, ctx) {
            if (builderResult.node) {
                builderResult.setTableContext(ctx.table!)
                statement.addWhereClause(builderResult.node)
            }
        }
    }
}