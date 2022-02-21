import { n } from "../sql-ast";
import { GraphItemTypes, ToSql, toSqlKey } from "./types";

export type Limit = {
    type: GraphItemTypes.LIMIT,
} & ToSql

export function createLimit(count: number): Limit {
    return {
        type: GraphItemTypes.LIMIT,
        [toSqlKey](statement) {
            statement.limit = new n.RawValue(count)
        }
    }
}