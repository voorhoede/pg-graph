import { Tables } from "../../../types";
import { OrderDirection, ValidComparisonSign } from "../../sql-ast";
import { SelectStatement } from "../../sql-ast/nodes";
import { TableFieldNames, TableFields, TableForTableName, TableLike, TableName, TableNamesForRelations, TableRelationDestColumn } from "../../type-utils";
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

export type TableSelection<AT extends TableLike = TableLike, T extends TableLike = TableLike> = {
    all: AT,
    curr: T,
    fields: TableFields<T>,
    tableNames: TableName<AT>,
}

export type TableSelectionFromName<AT extends TableLike, Name extends TableName<AT>> = TableSelection<AT, TableForTableName<AT, Name>>

export interface TabularSource<S extends TableSelection = TableSelection> extends TabularChain<S>, ToSql {
    type: GraphItemTypes.TABLE,
    atLeast(count: number): TabularSource<S>,
    agg(builderHandler: (builder: AggBuilder<S['fields']>) => void): TabularSource<S>,
    limit(count: number): TabularSource<S>,
    alias(name: string): TabularSource<S>,
    where<N extends TableFieldNames<S['fields']>>(name: N, sign: ValidComparisonSign, value: S['fields'][N]): TabularSource<S>,
    where(fn: (builder: WhereBuilder<S['fields']>) => void): TabularSource<S>,
    field<N extends TableFieldNames<S['fields']>>(name: N): Field,
    value(jsonProp: string, value: any): Value,
    orderBy(name: TableFieldNames<S['fields']>, mode?: OrderDirection): TabularSource<S>
}

export interface TabularSourcePlugins { }

export interface TabularChain<S extends TableSelection> {
    many<N extends TableNamesForRelations<S['curr'], 'many'>>(tableOrView: N, foreignKey: TableRelationDestColumn<S['curr'], 'many', N>, builder: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>): TabularSource<TableSelectionFromName<S['all'], N>>,
    many<N extends TableNamesForRelations<S['curr'], 'many'>>(tableOrView: N, builder: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>): TabularSource<TableSelectionFromName<S['all'], N>>,
    one<N extends TableNamesForRelations<S['curr'], 'one'>>(tableOrView: N, foreignKey: TableRelationDestColumn<S['curr'], 'one', N>, builder: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>): TabularSource<TableSelectionFromName<S['all'], N>>,
    one<N extends TableNamesForRelations<S['curr'], 'one'>>(tableOrView: N, builder: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>): TabularSource<TableSelectionFromName<S['all'], N>>,
    throughMany(table: S['tableNames'], foreignKey?: string): TabularChain<S>
    throughOne(table: S['tableNames'], foreignKey?: string): TabularChain<S>
}

export type TabularSourceBuilder<S extends TableSelection = TableSelection> = (source: TabularSource<S> & TabularSourcePlugins) => void

export type TabularSourceOptions<S extends TableSelection> = {
    buildContext: GraphBuildContext,
    name: S['tableNames'],
    builder: TabularSourceBuilder<S>,
}

export type TabularSourceToSqlOptions = {
    ctx: GraphToSqlContext,
    targetTableName: string,
    name: string,
    statement: SelectStatement,
    items: readonly Item[],
    countCondition?: CountCondition,
};