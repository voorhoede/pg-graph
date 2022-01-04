import { GraphItemTypes, ToSql, toSqlKey } from "./types";
import * as n from "../sql-ast/nodes";

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
            statement.addField(new n.Field(name, ctx.tableAlias), jsonProp)
        }
    }
}