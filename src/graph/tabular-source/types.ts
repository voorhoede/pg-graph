import { OrderDirection } from "../../sql-ast";
import { SelectStatement } from "../../sql-ast/nodes";
import { TableFieldNames, TableNamesForRelations, TableRelationDestColumn, TableSelection, TableSelectionFromName } from "../../type-utils";
import { AggBuilder } from "../agg-builder";
import { GraphBuildContext, GraphToSqlContext } from "../context";
import { Field } from "../field";
import { GraphItemTypes, ToSql } from "../types";
import { Value } from "../value";
import { WhereBuilder, WhereBuilderHandler } from "../where-builder";
import { CountCondition } from "./count-condition";

export type Item = {
    type: string,
    order?: number
} & ToSql

export type ToSqlHints = {
    joinStrategy: JoinStrategy;
}

export type JoinStrategy = 'agg' | 'lateral'

export interface TabularSource<S extends TableSelection = TableSelection> extends TabularChain<S>, ToSql {
    type: GraphItemTypes.TABLE,
    atLeast(count: number): TabularSource<S>,
    agg(builderHandler: (builder: AggBuilder<S['fields']>) => void): TabularSource<S>,
    limit(count: number): TabularSource<S>,
    alias(name: string): TabularSource<S>,
    where: WhereBuilder<S['fields'], TabularSource<S>>,
    field<N extends TableFieldNames<S['fields']>>(name: N): Field,
    value(jsonProp: string, value: any): Value,
    orderBy(name: TableFieldNames<S['fields']>, mode?: OrderDirection): TabularSource<S>
    toSqlHints(hints: ToSqlHints): void;
}

export interface TabularSourcePlugins { }

export interface TabularChain<S extends TableSelection = TableSelection> {
    /**
     * Create a one 2 many relation to the given table
     * @param tableOrView 
     * @param foreignKey
     * @param builder 
     */
     many<N extends TableNamesForRelations<S,'many'>>(tableOrView: N, foreignKey: TableRelationDestColumn<S, 'many', N>, builder: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>): TabularSource<TableSelectionFromName<S['all'], N>>,

    /**
     * Create a one 2 many relation to the given table
     * @param tableOrView 
     * @param builder 
     */
    many<N extends TableNamesForRelations<S,'many'>>(tableOrView: N, builder: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>): TabularSource<TableSelectionFromName<S['all'], N>>,
    
    /**
     * 
     * @param tableOrView 
     * @param foreignKey 
     * @param builder 
     */
    one<N extends TableNamesForRelations<S,'one'>>(tableOrView: N, foreignKey: TableRelationDestColumn<S, 'one', N>, builder: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>): TabularSource<TableSelectionFromName<S['all'], N>>,

    /**
     * Create a one 2 one relation to the given table
     * @param tableOrView 
     * @param builder 
     */
    one<N extends TableNamesForRelations<S,'one'>>(tableOrView: N, builder: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>): TabularSource<TableSelectionFromName<S['all'], N>>,
    
    
    throughMany<N extends TableNamesForRelations<S,'many'>>(table: N, whereBuilderHandler?: WhereBuilderHandler<TableSelectionFromName<S['all'], N>['fields']>): TabularChain<TableSelectionFromName<S['all'], N>>

    throughMany<N extends TableNamesForRelations<S,'many'>>(table: N, foreignKey?: TableRelationDestColumn<S, 'many', N>, whereBuilderHandler?: WhereBuilderHandler<TableSelectionFromName<S['all'], N>['fields']>): TabularChain<TableSelectionFromName<S['all'], N>>
    
    
    throughOne<N extends TableNamesForRelations<S,'one'>>(table: N, whereBuilderHandler?: WhereBuilderHandler<TableSelectionFromName<S['all'], N>['fields']>): TabularChain<TableSelectionFromName<S['all'], N>>
    
    throughOne<N extends TableNamesForRelations<S,'one'>>(table: N, foreignKey?: TableRelationDestColumn<S, 'one', N>, whereBuilderHandler?: WhereBuilderHandler<TableSelectionFromName<S['all'], N>['fields']>): TabularChain<TableSelectionFromName<S['all'], N>>
    
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
    toSqlHints: ToSqlHints,
};