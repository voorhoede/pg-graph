import { createAgg } from "../agg"
import { createAggBuilder } from "../agg-builder"
import { createField } from "../field"
import { createLimit } from "../limit"
import { createOrderBy } from "../order-by"
import { GraphItemTypes, RelationType, toSqlKey } from "../types"
import { createValue } from "../value"
import { createWhereBuilder } from "../where-builder"
import { createWhereClause } from "../where-clause"

import * as plugins from '../../plugins'
import { Item, TabularSource, TabularSourceOptions, TabularSourcePlugins, TabularSourceToSqlOptions, ToSqlHints } from "./types"
import { createThroughChain } from "./through-chain"
import { CountCondition, createCountCondition } from "./count-condition"
import { createNestedTabularSource } from "./nested-tabular-source"
import { TableFields, TableSelection } from "../../type-utils"

export function createBaseTabularSource<S extends TableSelection>({ buildContext, name, builder }: TabularSourceOptions<S>, toSql: (options: TabularSourceToSqlOptions) => void) {
    const items: Item[] = []

    let alias: string
    let countCondition: CountCondition | undefined
    let toSqlHints: ToSqlHints = {
        joinStrategy: 'agg'
    }

    const addItem = <N extends Item>(item: N) => {
        items.push(item)
        return item
    }

    type Fields = TableFields<S['curr']>

    const instance: TabularSource<S> = {
        type: GraphItemTypes.TABLE,

        toSqlHints(hints) {
            toSqlHints = hints;
        },

        limit(count) {
            addItem(createLimit(count))
            return this
        },

        atLeast(count) {
            countCondition = createCountCondition(buildContext, '>=', count)
            return this
        },

        agg(builderHandler) {
            const { builder, result } = createAggBuilder<Fields>(buildContext)
            builderHandler(builder)
            addItem(createAgg(result))
            return this
        },

        throughMany(table, foreignKey?, whereBuilderHandler?) {
            return createThroughChain<any>({ buildContext, addTabularSourceItem: addItem })
                .throughMany(table, foreignKey, whereBuilderHandler as any)
        },

        throughOne(table, foreignKey?, whereBuilderHandler?) {
            return createThroughChain<any>({ buildContext, addTabularSourceItem: addItem })
                .throughOne(table, foreignKey, whereBuilderHandler as any)
        },

        many(name, foreignKeyOrFn, builder?) {
            if (typeof foreignKeyOrFn === 'function') {
                return addItem( createNestedTabularSource({ buildContext, name, builder: foreignKeyOrFn }, RelationType.Many) )
            } else {
                return addItem( createNestedTabularSource({ buildContext, name, builder: builder! as any }, RelationType.Many, foreignKeyOrFn) )
            }
        },

        one(name, foreignKeyOrFn, builder?) {
            if (typeof foreignKeyOrFn === 'function') {
                return addItem( createNestedTabularSource({ buildContext, name, builder: foreignKeyOrFn }, RelationType.One) )
            } else {
                return addItem( createNestedTabularSource({ buildContext, name, builder: builder! as any }, RelationType.One, foreignKeyOrFn) )
            }
        },

        where(nameOrBuilderHandler: any, sign?: any, value?: any) {
            const { builder, result } = createWhereBuilder<Fields>(buildContext)
            if (typeof nameOrBuilderHandler === 'function') {
                nameOrBuilderHandler(builder)
            } else {
                builder(nameOrBuilderHandler, sign!, value!)
            }
            addItem(createWhereClause(result))
            return this
        },

        alias(name) {
            alias = name;
            return this
        },

        field(name) {
            return addItem( createField(name) )
        },

        value(jsonProp, value) {
            return addItem( createValue(jsonProp, value, buildContext) )
        },

        orderBy(name, mode) {
            addItem( createOrderBy(name, mode) )
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
                toSqlHints,
            })
        }
    }

    builder?.(instance as (TabularSource<S> & TabularSourcePlugins))

    return instance
}