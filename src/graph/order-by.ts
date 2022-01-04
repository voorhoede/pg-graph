import { GraphItemTypes, ToSql, toSqlKey } from "./types";
import { n } from "../sql-ast";
import { OrderDirection } from "../sql-ast/types";

export type OrderBy = {
    type: GraphItemTypes.ORDER_BY,
} & ToSql

export function createOrderBy(name: string, mode?: OrderDirection): OrderBy {
    return {
        type: GraphItemTypes.ORDER_BY,
        [toSqlKey](statement, ctx) {
            statement.addOrderBy(n.orderByColumn(n.field(name, ctx.tableAlias), mode))
        }
    }
}