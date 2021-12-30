import { GraphItemTypes, ToSql, toSqlKey } from "./types";
import { n } from "../sql-ast";

export type Field = {
    type: GraphItemTypes.FIELD,
    alias(jsonProp: string): Field;
} & ToSql

export function createField(name: string): Field {
    let jsonProp = name;

    return {
        type: GraphItemTypes.FIELD,
        alias(alias: string) {
            jsonProp = alias;
            return this
        },
        [toSqlKey](statement, ctx) {
            statement.fields.add(n.field(name, ctx.tableAlias), jsonProp)
        }
    }
}