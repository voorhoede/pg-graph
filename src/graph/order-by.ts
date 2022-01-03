import { GraphItemTypes, ToSql, toSqlKey } from "./types";
import { n } from "../sql-ast";
import { OrderDirection } from "../sql-ast/types";
import { OrderByColumn } from "../sql-ast/node-types";
import { GraphToSqlContext } from "./context";

export type OrderBy = {
    type: GraphItemTypes.ORDER_BY,
    toAstNode(ctx: GraphToSqlContext): OrderByColumn,
} & ToSql

export function createOrderBy(name: string, mode?: OrderDirection): OrderBy {
    return {
        type: GraphItemTypes.ORDER_BY,
        toAstNode(ctx: GraphToSqlContext) {
            return n.orderByColumn(n.field(name, ctx.tableAlias), mode)
        },
        [toSqlKey](statement, ctx) {
            statement.addOrderBy(n.orderByColumn(n.field(name, ctx.tableAlias), mode))
        }
    }
}