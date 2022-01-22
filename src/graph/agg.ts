import { GraphItemTypes, ToSql, toSqlKey } from "./types"
import { AggBuilderResult } from "./agg-builder"

export type Agg = {
    type: GraphItemTypes.AGG,
} & ToSql

export function createAgg(result: AggBuilderResult): Agg {
    return {
        type: GraphItemTypes.AGG,

        [toSqlKey](statement, ctx) {
            result.setTableContext(ctx.table!)
            result.addToStatement(statement)
        }
    }
}