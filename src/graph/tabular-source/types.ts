import { OrderDirection, ValidComparisonSign } from "../../sql-ast";
import { SelectStatement } from "../../sql-ast/nodes";
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

export interface TabularSource extends TabularChain, ToSql {
    type: GraphItemTypes.TABLE,
    atLeast(count: number): TabularSource,
    agg(builderHandler: (builder: AggBuilder) => void): TabularSource,
    limit(count: number): TabularSource,
    alias(name: string): TabularSource,
    where(name: string, sign: ValidComparisonSign, value: any): TabularSource,
    where(fn: (builder: WhereBuilder) => void): TabularSource,
    field(name: string): Field,
    value(jsonProp: string, value: any): Value,
    orderBy(name: string, mode?: OrderDirection): TabularSource
}

export interface TabularSourcePlugins { }

export interface TabularChain {
    many(tableOrView: string, foreignKey: string, builder: TabularSourceBuilder): TabularSource,
    many(tableOrView: string, builder: TabularSourceBuilder): TabularSource,
    one(tableOrView: string, foreignKey: string, builder: TabularSourceBuilder): TabularSource,
    one(tableOrView: string, builder: TabularSourceBuilder): TabularSource,
    throughMany(table: string, foreignKey?: string): TabularChain
    throughOne(table: string, foreignKey?: string): TabularChain
}

export type TabularSourceBuilder = (source: TabularSource & TabularSourcePlugins) => void

export type TabularSourceOptions = {
    buildContext: GraphBuildContext,
    name: string,
    builder: TabularSourceBuilder,
}

export type TabularSourceToSqlOptions = {
    ctx: GraphToSqlContext,
    targetTableName: string,
    name: string,
    statement: SelectStatement,
    items: readonly Item[],
    countCondition?: CountCondition,
};