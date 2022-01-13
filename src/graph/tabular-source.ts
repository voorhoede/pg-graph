import { GraphBuildContext, GraphToSqlContext } from "./context"
import { createWhereBuilder, WhereBuilder } from "./where-builder"
import { createAggBuilder, AggBuilder } from "./agg-builder"
import { GraphItemTypes, ToSql, toSqlKey } from "./types"

import { createWhereClause, Where } from "./where-clause"
import { createField, Field } from "./field"
import { createValue, Value } from "./value"
import { createOrderBy, OrderBy } from "./order-by"
import { createAgg, Agg } from './agg'

import { n, ValidComparisonSign, JoinType, json } from "../sql-ast";
import { OrderDirection } from "../sql-ast/types"

import * as joinHelpers from './helpers'

export type TabularSourceBuilder = (s: TabularSource) => void

export type TabularSource = {
    type: GraphItemTypes.TABLE,
    agg(builderHandler: (builder: AggBuilder) => void): TabularSource,
    alias(name: string): TabularSource,
    where(name: string, sign: ValidComparisonSign, value: any): TabularSource,
    where(fn: (builder: WhereBuilder) => void): TabularSource,
    field(name: string): Field,
    value(jsonProp: string, value: any): Value,
    orderBy(name: string, mode?: OrderDirection): TabularSource
} & TabularChain & ToSql

type TabularChain = {
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
    through?: Through
};

type Through = {
    table: string,
    foreignKey?: string,
    rel: NestedRelationType,
}

type Item = TabularSource | Field | Value | Where | OrderBy | Agg;

export enum NestedRelationType {
    Many,
    One,
}

function getTabularItemsCount(items: readonly Item[]): number {
    return items.reduce((acc, item) => item.type === GraphItemTypes.TABLE ? (acc + 1) : acc, 0)
}

export function createRootTabularSource(options: TabularSourceOptions) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name }) => {
        const alias = ctx.genTableAlias(targetTable)

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

        // todo check if the cte already exists?
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

export function createNestedTabularSource(options: TabularSourceOptions, relType: NestedRelationType, foreignKey?: string, through?: Through[]) {
    return createBaseTabularSource(options, ({ targetTable, statement, ctx, items, name }) => {
        const parentTableAlias = ctx.tableAlias!
        const parentTable = ctx.table!
        const targetTableAlias = ctx.genTableAlias(targetTable)

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

            const derivedAlias = ctx.genTableAlias(targetTable);
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
                        NestedRelationType.One,
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
                console.log(targetTable, parentTable)

                statement.joins.push(new n.Join(
                    JoinType.LEFT_JOIN,
                    new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias),
                    joinHelpers.createComparison(
                        NestedRelationType.One,
                        new n.TableRefWithAlias(new n.TableRef(targetTable), targetTableAlias), // comment.id
                        new n.TableRefWithAlias(new n.TableRef(parentTable), parentTableAlias), // user.comment_id
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

        if (throughItem.rel === NestedRelationType.One) {
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
        } else if (throughItem.rel === NestedRelationType.Many) {
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
                rel: NestedRelationType.Many,
            })
            return this
        },
        throughOne(table: string, foreignKey?: string) {
            throughs.push({
                table,
                foreignKey,
                rel: NestedRelationType.One,
            })
            return this
        },
        many(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, NestedRelationType.Many, undefined, throughs);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, NestedRelationType.Many, foreignKeyOrFn, throughs);
            }
            items.push(item)
            return item
        },
        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, NestedRelationType.One, undefined, throughs);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, NestedRelationType.One, foreignKeyOrFn, throughs);
            }
            items.push(item)
            return item
        }
    }
}

function createBaseTabularSource({ ctx, name, builder }: TabularSourceOptions, toSql: (options: TabularSourceToSqlOptions) => void) {
    const items: Item[] = []

    let alias: string

    const instance: TabularSource = {
        type: GraphItemTypes.TABLE,
        agg(builderHandler: (builder: AggBuilder) => void) {
            const { builder, result } = createAggBuilder(ctx)
            builderHandler(builder)
            items.push(createAgg(result))
            return this
        },
        throughMany(table: string, foreignKey?: string) {
            const initialThrough: Through = {
                table,
                foreignKey,
                rel: NestedRelationType.Many,
            }

            return createThroughChain({ ctx, initialThrough, items })
        },
        throughOne(table: string, foreignKey?: string) {
            const initialThrough: Through = {
                table,
                foreignKey,
                rel: NestedRelationType.One,
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
            items.push(item)
            return item
        },
        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ ctx, name, builder: foreignKeyOrFn }, NestedRelationType.One);
            } else {
                item = createNestedTabularSource({ ctx, name, builder: builder! }, NestedRelationType.One, foreignKeyOrFn);
            }
            items.push(item)
            return item
        },
        where(nameOrBuilderHandler: ((builder: WhereBuilder) => void) | string, sign?: ValidComparisonSign, value?: any) {
            const { builder, result } = createWhereBuilder(ctx)
            if (typeof nameOrBuilderHandler === 'function') {
                nameOrBuilderHandler(builder)
            } else {
                builder(nameOrBuilderHandler, sign!, value)
            }
            items.push(createWhereClause(result))
            return this
        },
        alias(name) {
            alias = name;
            return this
        },
        field(name) {
            const fieldItem = createField(name)
            items.push(fieldItem)
            return fieldItem
        },
        value(jsonProp, value) {
            const valueItem = createValue(jsonProp, value, ctx);
            items.push(valueItem)
            return valueItem
        },
        orderBy(name, mode) {
            const orderBy = createOrderBy(name, mode)
            items.push(orderBy)
            return this
        },
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

    builder?.(instance)

    return instance
}

function itemsToSql(items: readonly Item[], statement: n.SelectStatement, ctx: GraphToSqlContext) {
    items.forEach(item => item[toSqlKey](statement, ctx))
}