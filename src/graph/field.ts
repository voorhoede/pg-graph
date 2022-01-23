import { GraphItemTypes, ToSql, toSqlKey } from "./types";
import { json } from "../sql-ast";
import { BuiltinGroups } from "../sql-ast/json-utils";

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
            json.addField(statement, BuiltinGroups.Data, jsonProp, ctx.table!.column(name))
        }
    }
}