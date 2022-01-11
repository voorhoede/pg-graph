import { GraphBuildContext, GraphToSqlContext } from "./context"
import { createWhereBuilder, WhereBuilder } from "./where-builder"
import { createAggBuilder, AggBuilder } from "./agg-builder"
import { GraphItemTypes, ToSql, toSqlKey } from "./types"

import { createWhereClause } from "./where-clause"
import { createField, Field } from "./field"
import { createValue, Value } from "./value"
import { createOrderBy } from "./order-by"
import { createAgg } from './agg'
import { createLimit } from './limit'

import { n, ValidComparisonSign, JoinType, json } from "../sql-ast";
import { OrderDirection } from "../sql-ast/types"

import * as plugins from '../plugins'

export type TabularSourceBuilder = (source: TabularSource & TabularSourcePlugins) => void

export interface TabularSource extends TabularChain, ToSql {
    type: GraphItemTypes.TABLE,
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
    through(table: string, foreignKey?: string): TabularChain
}

type TabularSourceOptions = {
    ctx: GraphBuildContext,
    name: string,
    builder: TabularSourceBuilder,
}

type TabularSourceToSqlOptions = {
    ctx: GraphToSqlContext,
    targetTable: string,
    name: string,
    statement: n.SelectStatement,
    items: readonly Item[],
    through?: Through
};

type Through = {
    table: string,
    foreignKey?: string
}

export type Item = { type: string } & ToSql

export enum NestedRelationType {
    Many,
    One,
}

export function createRootTabularSource(options: TabularSourceOptions) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name }) => {
        const alias = ctx.genTableAlias()

        const subCtx = ctx.createSubContext()
        subCtx.table = targetTable
        subCtx.tableAlias = alias;
        subCtx.subRelationCount = getTabularItemsCount(items)

        // we create a cte that uses json_build_object to build the result
        const cteSelect = new n.SelectStatement()
        cteSelect.source = new n.TableRefWithAlias(new n.TableRef(targetTable), alias)

        // apply all items to the cteSelect
        itemsToSql(items, cteSelect, subCtx)

        json.convertDataFieldsToAgg(cteSelect)

        if (cteSelect.fields.size === 0) {
            json.convertToEmptyDataStatement(cteSelect)
            return
        }

        const cte = new n.Cte(`${name}Cte`, cteSelect)
        statement.ctes.set(cte.name, cte)

        if (!statement.source) {
            statement.source = new n.TableRef(cte.name)
        } else {
            statement.joins.push(new n.Join(JoinType.CROSS_JOIN, new n.TableRef(cte.name)))
        }

        json.addReferencesToChildFields({
            withPrefix: name,
            dest: statement,
            src: cte,
        })
    })
}

export function createNestedTabularSource(options: TabularSourceOptions, relType: NestedRelationType, foreignKey?: string, through?: Through) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name }) => {
        const parentTableAlias = ctx.tableAlias!
        const parentTable = ctx.table!
        const targetTableAlias = ctx.genTableAlias()

        const subTabularSourceItems = getTabularItemsCount(items)

        const subCtx = ctx.createSubContext()
        subCtx.tableAlias = targetTableAlias;
        subCtx.table = targetTable;
        subCtx.subRelationCount = subTabularSourceItems;

        if (relType === NestedRelationType.Many) {

            /*
                Aggregrate before join for complex constructs where we are nested a couple of levels
            */

            const subStatement = new n.SelectStatement()
            subStatement.source = new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias)

            itemsToSql(
                items,
                subStatement,
                subCtx
            )

            json.convertDataFieldsToAgg(subStatement)

            let foreignField: n.Column
            if (through) {
                // todo make this a loop

                const joinAlias = ctx.genTableAlias()

                foreignField = new n.Column('id', joinAlias)

                subStatement.joins.push(new n.Join(
                    JoinType.INNER_JOIN,
                    new n.TableRefWithAlias(new n.TableRef(through.table), joinAlias),
                    new n.Compare(
                        new n.Column(guessForeignKey(through.table), targetTableAlias),
                        '=',
                        new n.Column('id', joinAlias),
                    )
                ))
            } else {
                foreignField = new n.Column(foreignKey ?? guessForeignKey(parentTable), targetTableAlias)
            }

            subStatement.fields.set(json.createHiddenFieldName('group'), foreignField)
            subStatement.groupBys.push(foreignField)

            const derivedAlias = ctx.genTableAlias();
            const derivedTable = new n.DerivedTable(subStatement, derivedAlias)

            statement.joins.push(new n.Join(
                JoinType.LEFT_JOIN,
                derivedTable,
                new n.Compare(
                    new n.Column(json.createHiddenFieldName('group'), derivedAlias),
                    '=',
                    new n.Column('id', parentTableAlias)
                )
            ))

            json.addReferencesToChildFields({
                src: derivedTable,
                dest: statement,
                withPrefix: name,
            })
        } else if (relType === NestedRelationType.One) {
            /*
                One to one relation
            */

            const subStatement = new n.SelectStatement()

            itemsToSql(items, subStatement, subCtx)

            if (through) {
                const joinAlias = ctx.genTableAlias()

                // todo make this a loop

                statement.joins.push(new n.Join(
                    JoinType.LEFT_JOIN,
                    new n.TableRefWithAlias(new n.TableRef(through.table), joinAlias),
                    new n.Compare(
                        new n.Column(through.foreignKey ?? guessForeignKey(through.table), parentTableAlias),
                        '=',
                        new n.Column('id', joinAlias),
                    )
                ))

                statement.joins.push(new n.Join(
                    JoinType.INNER_JOIN,
                    new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias),
                    new n.Compare(
                        new n.Column('id', targetTableAlias),
                        '=',
                        new n.Column(foreignKey ?? guessForeignKey(targetTable), joinAlias)
                    )
                ))


            } else {
                statement.joins.push(new n.Join(
                    JoinType.LEFT_JOIN,
                    new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias),
                    new n.Compare(
                        new n.Column(foreignKey ?? guessForeignKey(parentTable), parentTableAlias),
                        '=',
                        new n.Column('id', targetTableAlias)
                    )
                ))
            }

            json.copyFieldsInto(subStatement, statement, 'data', name)

            subStatement.copyWhereClauseTo(statement)

        } else {
            (relType as never)
        }


    })
}

function createThroughChain({ ctx, initialThrough, items }: { ctx: GraphBuildContext, initialThrough: Through, items: Item[] }): TabularChain {
    const throughs: Through[] = [initialThrough]

    return {
        through(table: string, foreignKey?: string) {
            throughs.push({
                table,
                foreignKey,
            })
            return this
        },
        many(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, NestedRelationType.Many, undefined, throughs[0]);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, NestedRelationType.Many, foreignKeyOrFn, throughs[0]);
            }
            items.push(item)
            return item
        },
        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, NestedRelationType.One, undefined, throughs[0]);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, NestedRelationType.One, foreignKeyOrFn, throughs[0]);
            }
            items.push(item)
            return item
        }
    }
}

function createBaseTabularSource({ ctx, name, builder }: TabularSourceOptions, toSql: (options: TabularSourceToSqlOptions) => void) {
    const items: Item[] = []

    let alias: string

    const addItem = (item: Item) => items.push(item)

    const instance: TabularSource = {
        type: GraphItemTypes.TABLE,
        limit(count: number) {
            addItem(createLimit(count))
            return this
        },
        agg(builderHandler: (builder: AggBuilder) => void) {
            const { builder, result } = createAggBuilder(ctx)
            builderHandler(builder)
            addItem(createAgg(result))
            return this
        },
        through(table: string, foreignKey?: string) {
            const initialThrough: Through = {
                table,
                foreignKey,
            }
            return createThroughChain({ ctx, initialThrough, items })
        },
        many(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, NestedRelationType.Many);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, NestedRelationType.Many, foreignKeyOrFn);
            }
            addItem(item)
            return item
        },
        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, NestedRelationType.One);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, NestedRelationType.One, foreignKeyOrFn);
            }
            addItem(item)
            return item
        },
        where(nameOrBuilderHandler: ((builder: WhereBuilder) => void) | string, sign?: ValidComparisonSign, value?: any) {
            const { builder, result } = createWhereBuilder(ctx)
            if (typeof nameOrBuilderHandler === 'function') {
                nameOrBuilderHandler(builder)
            } else {
                builder(nameOrBuilderHandler, sign!, value)
            }
            addItem(createWhereClause(result))
            return this
        },
        alias(name) {
            alias = name;
            return this
        },
        field(name) {
            const fieldItem = createField(name)
            addItem(fieldItem)
            return fieldItem
        },
        value(jsonProp, value) {
            const valueItem = createValue(jsonProp, value, ctx);
            addItem(valueItem)
            return valueItem
        },
        orderBy(name, mode) {
            const orderBy = createOrderBy(name, mode)
            addItem(orderBy)
            return this
        },

        ...plugins.mountPluginFor(plugins.PluginType.TabularSource, {
            addItem,
            buildContext: ctx,
        }),

        [toSqlKey](statement, ctx) {
            toSql({
                ctx,
                statement,
                targetTable: name,
                name: alias ?? name,
                items,
            })
        }
    }

    builder?.(instance as any)

    return instance
}

function getTabularItemsCount(items: readonly Item[]): number {
    return items.reduce((acc, item) => item.type === GraphItemTypes.TABLE ? (acc + 1) : acc, 0)
}

function guessForeignKey(tableName: string) {
    return `${tableName.toLowerCase()}_id`
}

function itemsToSql(items: readonly Item[], statement: n.SelectStatement, ctx: GraphToSqlContext) {
    items.forEach(item => item[toSqlKey](statement, ctx))
}