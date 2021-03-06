import { json } from "../sql-ast"
import { GraphBuildContext } from "./context"
import { GraphItemTypes, ToSql, toSqlKey } from "./types"

export type Value = {
    type: GraphItemTypes.VALUE,
} & ToSql

export function createValue(jsonProp: string, value: any, ctx: GraphBuildContext): Value {
    const placeholder = ctx.createPlaceholderForValue(value)

    return {
        type: GraphItemTypes.VALUE,
        [toSqlKey](statement) {
            json.addField(statement, 'data', jsonProp, placeholder)
        }
    }
}