import { SelectStatement } from "../../sql-ast/nodes";
import { GraphToSqlContext } from "../context";
import { toSqlKey } from "../types";
import { Item } from "./types";

export function itemsToSql(items: readonly Item[], statement: SelectStatement, ctx: GraphToSqlContext) {
    [...items]
        .sort((a: Item, b: Item) => (a.order ?? 0) - (b.order ?? 0))
        .forEach(item => item[toSqlKey]!(statement, ctx))
}

