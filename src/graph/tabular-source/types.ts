import { OrderDirection, ValidComparisonSign } from "../../sql-ast";
import { SelectStatement } from "../../sql-ast/nodes";
import { TableFieldNames, TableFields, TableLike } from "../../type-utils";
import { AggBuilder } from "../agg-builder";
import { GraphBuildContext, GraphToSqlContext } from "../context";
import { Field } from "../field";
import { GraphItemTypes, ToSql } from "../types";
import { Value } from "../value";
import { WhereBuilder } from "../where-builder";
import { CountCondition } from "./count-condition";

export type Item = {
    type: string,
    order?: number
} & ToSql

export interface TabularSource<T extends TableLike = TableLike, Fields = TableFields<T>> extends TabularChain<T>, ToSql {
    type: GraphItemTypes.TABLE,
    atLeast(count: number): TabularSource<T>,
    agg(builderHandler: (builder: AggBuilder<Fields>) => void): TabularSource<T>,
    limit(count: number): TabularSource<T>,
    alias(name: string): TabularSource<T>,
    where<N extends TableFieldNames<Fields>>(name: N, sign: ValidComparisonSign, value: Fields[N]): TabularSource<T>,
    where(fn: (builder: WhereBuilder<Fields>) => void): TabularSource<T>,
    field(name: TableFieldNames<Fields>): Field,
    value(jsonProp: string, value: any): Value,
    orderBy(name: TableFieldNames<Fields>, mode?: OrderDirection): TabularSource<T>
}

export interface TabularSourcePlugins { }

export interface TabularChain<T extends TableLike> {
    many(tableOrView: string, foreignKey: string, builder: TabularSourceBuilder<T>): TabularSource<T>,
    many(tableOrView: string, builder: TabularSourceBuilder<T>): TabularSource<T>,
    one(tableOrView: string, foreignKey: string, builder: TabularSourceBuilder<T>): TabularSource<T>,
    one(tableOrView: string, builder: TabularSourceBuilder<T>): TabularSource<T>,
    throughMany(table: string, foreignKey?: string): TabularChain<T>
    throughOne(table: string, foreignKey?: string): TabularChain<T>
}

export type TabularSourceBuilder<T extends TableLike> = (source: TabularSource<T> & TabularSourcePlugins) => void

export type TabularSourceOptions<T extends TableLike> = {
    buildContext: GraphBuildContext,
    name: string,
    builder: TabularSourceBuilder<T>,
}

export type TabularSourceToSqlOptions = {
    ctx: GraphToSqlContext,
    targetTableName: string,
    name: string,
    statement: SelectStatement,
    items: readonly Item[],
    countCondition?: CountCondition,
};