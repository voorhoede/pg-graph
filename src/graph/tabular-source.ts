import { GraphBuildContext, GraphToSqlContext } from "./context"
import { createWhereBuilder, WhereBuilder } from "./where-builder"
import { createAggBuilder, AggBuilder } from "./agg-builder"
import { GraphItemTypes, RelationType, ToSql, toSqlKey } from "./types"

import { createWhereClause } from "./where-clause"
import { createField, Field } from "./field"
import { createValue, Value } from "./value"
import { createOrderBy } from "./order-by"
import { createAgg } from './agg'
import { createLimit } from './limit'

import { n, ValidComparisonSign, JoinType, json } from "../sql-ast";
import { OrderDirection } from "../sql-ast/types"

import * as plugins from '../plugins'
import * as joinHelpers from './helpers'

export type TabularSourceBuilder = (source: TabularSource & TabularSourcePlugins) => void

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
    countCondition?: CountCondition,
};

type CountCondition = {
    operator: '>=' | '<='
    value: number
}

type Through = {
    table: string,
    foreignKey?: string,
    rel: RelationType,
}

export type Item = { type: string, order?: number } & ToSql

export function createRootTabularSource(options: TabularSourceOptions) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name, countCondition }) => {
        const alias = ctx.genTableAlias(targetTable)

        const subCtx = ctx.createSubContext()
        subCtx.table = targetTable
        subCtx.tableAlias = alias;

        const cteSelect = new n.SelectStatement()
        cteSelect.source = new n.TableRefWithAlias(new n.TableRef(targetTable), alias)

        // apply all items to the cteSelect
        itemsToSql(items, cteSelect, subCtx)

        json.convertDataFieldsToAgg(cteSelect)

        if (cteSelect.fields.size === 0) {
            json.convertToEmptyDataStatement(cteSelect)
            return
        }

        if (countCondition?.operator === '>=') {
            cteSelect.having = new n.Compare(
                new n.AggCall('count', [new n.All(alias)]),
                countCondition.operator,
                options.ctx.createPlaceholderForValue(countCondition.value)
            )
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

export function createNestedTabularSource(options: TabularSourceOptions, relType: RelationType, foreignKey?: string, through?: Through[]) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name, countCondition }) => {
        const parentTableAlias = ctx.tableAlias!
        const parentTable = ctx.table!
        const targetTableAlias = ctx.genTableAlias(targetTable)

        const subCtx = ctx.createSubContext()
        subCtx.tableAlias = targetTableAlias;
        subCtx.table = targetTable;

        if (relType === RelationType.Many) {
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

            let groupByField = joinHelpers.getOneHasOneColumnRef(subStatement.source, new n.TableRef(parentTable), foreignKey)

            if (through?.length) {
                const [lastThroughTableRef, lastThroughItem] = applyThroughItemsToStatement(
                    ctx,
                    subStatement,
                    [...through].reverse(),
                    subStatement.source
                )

                groupByField = joinHelpers.getOneHasOneColumnRef(lastThroughTableRef!, new n.TableRef(parentTable), lastThroughItem!.foreignKey)
            }

            subStatement.fields.set(json.createHiddenFieldName('group'), groupByField)
            subStatement.groupBys.push(groupByField)

            if (countCondition?.operator === '>=' && countCondition.value > 1) {
                subStatement.having = new n.Compare(
                    new n.AggCall('count', [new n.All(targetTableAlias)]),
                    countCondition.operator,
                    options.ctx.createPlaceholderForValue(countCondition.value)
                )
            }

            const derivedTable = new n.DerivedTable(subStatement, targetTableAlias)

            statement.joins.push(new n.Join(
                countCondition?.operator === '>=' && countCondition.value >= 1 ? JoinType.INNER_JOIN : JoinType.LEFT_JOIN,
                derivedTable,
                joinHelpers.createComparison(
                    RelationType.Many,
                    new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias),
                    new n.TableRefWithAlias(new n.TableRef(parentTable), parentTableAlias),
                    json.createHiddenFieldName('group'),
                )
            ))

            json.addReferencesToChildFields({
                src: derivedTable,
                dest: statement,
                withPrefix: name,
            })

        } else if (relType === RelationType.One) {
            /*
                One to one relation
            */

            const subStatement = new n.SelectStatement()

            itemsToSql(items, subStatement, subCtx)

            if (through?.length) {
                const [source, ...remainingThroughItems] = through;

                const sourceTableAlias = ctx.genTableAlias(source.table)
                subStatement.source = new n.TableRefWithAlias(new n.TableRef(source.table), sourceTableAlias)
                subStatement.addWhereClause(
                    joinHelpers.createComparison(
                        source.rel,
                        subStatement.source,
                        new n.TableRefWithAlias(new n.TableRef(parentTable), parentTableAlias),
                        source.foreignKey
                    )
                )
                subStatement.limit = 1

                const [lastThroughTableRef,] = applyThroughItemsToStatement(
                    ctx,
                    subStatement,
                    remainingThroughItems,
                    subStatement.source
                )

                subStatement.joins.push(new n.Join(
                    JoinType.INNER_JOIN,
                    new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias),
                    joinHelpers.createComparison(
                        RelationType.One,
                        new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias),
                        lastThroughTableRef ?? subStatement.source,
                        foreignKey,
                    )
                ))

                const lateralAlias = subCtx.genTableAlias(targetTable)

                statement.joins.push(new n.Join(
                    JoinType.LEFT_JOIN_LATERAL,
                    new n.DerivedTable(subStatement, lateralAlias),
                    n.Identifier.true,
                ))

                json.addField(statement, 'data', name, new n.Column('data', lateralAlias))

            } else {

                statement.joins.push(new n.Join(
                    JoinType.LEFT_JOIN,
                    new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias),
                    joinHelpers.createComparison(
                        RelationType.One,
                        new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias),
                        new n.TableRefWithAlias(new n.TableRef(parentTable), parentTableAlias),
                        foreignKey,
                    )
                ))

                subStatement.copyWhereClauseTo(statement)

                json.copyFieldsInto(subStatement, statement, 'data', name)
            }

        } else {
            (relType as never)
        }

    })
}

function applyThroughItemsToStatement(ctx: GraphToSqlContext, statement: n.SelectStatement, items: Through[], targetTableRef: n.TableRefWithAlias): [n.TableRefWithAlias | undefined, Through | undefined] {
    let prevThroughItem: Through | undefined;
    let prevThroughTableRef: n.TableRefWithAlias | undefined;

    for (let throughItem of items) {
        const throughTableAlias = ctx.genTableAlias(throughItem.table)
        const throughTableRef = new n.TableRefWithAlias(new n.TableRef(throughItem.table), throughTableAlias)

        if (throughItem.rel === RelationType.One) {
            statement.joins.push(new n.Join(
                JoinType.INNER_JOIN,
                throughTableRef,
                joinHelpers.createComparison(
                    throughItem.rel,
                    throughTableRef,
                    prevThroughTableRef ?? targetTableRef,
                    throughItem.foreignKey,
                )
            ))
        } else if (throughItem.rel === RelationType.Many) {
            statement.joins.push(new n.Join(
                JoinType.INNER_JOIN,
                throughTableRef,
                joinHelpers.createComparison(
                    throughItem.rel,
                    throughTableRef,
                    prevThroughTableRef ?? targetTableRef,
                    prevThroughItem ? prevThroughItem.foreignKey : throughItem.foreignKey,
                )
            ))
        } else {
            (throughItem.rel as never)
        }

        prevThroughTableRef = throughTableRef
        prevThroughItem = throughItem
    }

    return [prevThroughTableRef, prevThroughItem]
}

function createThroughChain({ ctx, initialThrough, items }: { ctx: GraphBuildContext, initialThrough: Through, items: Item[] }): TabularChain {
    const throughs: Through[] = [initialThrough]

    return {
        throughMany(table: string, foreignKey?: string) {
            throughs.push({
                table,
                foreignKey,
                rel: RelationType.Many,
            })
            return this
        },
        throughOne(table: string, foreignKey?: string) {
            throughs.push({
                table,
                foreignKey,
                rel: RelationType.One,
            })
            return this
        },
        many(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, RelationType.Many, undefined, throughs);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, RelationType.Many, foreignKeyOrFn, throughs);
            }
            items.push(item)
            return item
        },
        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, RelationType.One, undefined, throughs);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, RelationType.One, foreignKeyOrFn, throughs);
            }
            items.push(item)
            return item
        }
    }
}

function createBaseTabularSource({ ctx, name, builder }: TabularSourceOptions, toSql: (options: TabularSourceToSqlOptions) => void) {
    const items: Item[] = []

    let alias: string
    let countCondition: CountCondition | undefined

    const addItem = (item: Item) => items.push(item)

    const instance: TabularSource = {
        type: GraphItemTypes.TABLE,
        limit(count: number) {
            addItem(createLimit(count))
            return this
        },
        atLeast(count: number) {
            countCondition = { operator: '>=', value: count }
            return this
        },
        agg(builderHandler: (builder: AggBuilder) => void) {
            const { builder, result } = createAggBuilder(ctx)
            builderHandler(builder)
            addItem(createAgg(result))
            return this
        },
        throughMany(table: string, foreignKey?: string) {
            const initialThrough: Through = {
                table,
                foreignKey,
                rel: RelationType.Many,
            }

            return createThroughChain({ ctx, initialThrough, items })
        },
        throughOne(table: string, foreignKey?: string) {
            const initialThrough: Through = {
                table,
                foreignKey,
                rel: RelationType.One,
            }
            return createThroughChain({ ctx, initialThrough, items })
        },
        many(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, RelationType.Many);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, RelationType.Many, foreignKeyOrFn);
            }
            addItem(item)
            return item
        },
        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, RelationType.One);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, RelationType.One, foreignKeyOrFn);
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
                countCondition,
            })
        }
    }

    builder?.(instance as any)

    return instance
}

function itemsToSql(items: readonly Item[], statement: n.SelectStatement, ctx: GraphToSqlContext) {
    [...items]
        .sort((a: Item, b: Item) => (a.order ?? 0) - (b.order ?? 0))
        .forEach(item => item[toSqlKey]!(statement, ctx))
}