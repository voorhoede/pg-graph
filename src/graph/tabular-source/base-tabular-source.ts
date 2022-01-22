import { ValidComparisonSign } from "../../sql-ast"
import { createAgg } from "../agg"
import { AggBuilder, createAggBuilder } from "../agg-builder"
import { createField } from "../field"
import { createLimit } from "../limit"
import { createOrderBy } from "../order-by"
import { GraphItemTypes, RelationType, toSqlKey } from "../types"
import { createValue } from "../value"
import { createWhereBuilder, WhereBuilder } from "../where-builder"
import { createWhereClause } from "../where-clause"

import * as plugins from '../../plugins'
import { Item, TabularSource, TabularSourceBuilder, TabularSourceOptions, TabularSourceToSqlOptions } from "./types"
import { createThroughChain, ThroughItem } from "./through-chain"
import { CountCondition, createCountCondition } from "./count-condition"
import { createNestedTabularSource } from "./nested-tabular-source"

export function createBaseTabularSource({ buildContext, name, builder }: TabularSourceOptions, toSql: (options: TabularSourceToSqlOptions) => void) {
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
            countCondition = createCountCondition(buildContext, '>=', count)
            return this
        },

        agg(builderHandler: (builder: AggBuilder) => void) {
            const { builder, result } = createAggBuilder(buildContext)
            builderHandler(builder)
            addItem(createAgg(result))
            return this
        },

        throughMany(table: string, foreignKey?: string) {
            const initialThrough: ThroughItem = {
                table,
                foreignKey,
                rel: RelationType.Many,
            }

            return createThroughChain({ buildContext, initialThrough, addTabularSourceItem: addItem })
        },

        throughOne(table: string, foreignKey?: string) {
            const initialThrough: ThroughItem = {
                table,
                foreignKey,
                rel: RelationType.One,
            }
            return createThroughChain({ buildContext, initialThrough, addTabularSourceItem: addItem })
        },

        many(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ buildContext, name, builder: foreignKeyOrFn }, RelationType.Many);
            } else {
                item = createNestedTabularSource({ buildContext, name, builder: builder! }, RelationType.Many, foreignKeyOrFn);
            }
            addItem(item)
            return item
        },

        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ buildContext, name, builder: foreignKeyOrFn }, RelationType.One);
            } else {
                item = createNestedTabularSource({ buildContext, name, builder: builder! }, RelationType.One, foreignKeyOrFn);
            }
            addItem(item)
            return item
        },

        where(nameOrBuilderHandler: ((builder: WhereBuilder) => void) | string, sign?: ValidComparisonSign, value?: any) {
            const { builder, result } = createWhereBuilder(buildContext)
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
            const valueItem = createValue(jsonProp, value, buildContext);
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
            buildContext,
        }),

        [toSqlKey](statement, ctx) {
            toSql({
                ctx,
                statement,
                targetTableName: name,
                name: alias ?? name,
                items,
                countCondition,
            })
        }
    }

    builder?.(instance as any)

    return instance
}