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
import { Item, TableSelection, TableSelectionFromName, TabularSource, TabularSourceBuilder, TabularSourceOptions, TabularSourcePlugins, TabularSourceToSqlOptions } from "./types"
import { createThroughChain, ThroughItem } from "./through-chain"
import { CountCondition, createCountCondition } from "./count-condition"
import { createNestedTabularSource } from "./nested-tabular-source"
import { TableFieldNames, TableFields } from "../../type-utils"

export function createBaseTabularSource<S extends TableSelection>({ buildContext, name, builder }: TabularSourceOptions<S>, toSql: (options: TabularSourceToSqlOptions) => void) {
    const items: Item[] = []

    let alias: string
    let countCondition: CountCondition | undefined

    const addItem = <N extends Item>(item: N) => {
        items.push(item)
        return item
    }

    type Fields = TableFields<S['curr']>

    const instance: TabularSource<S> = {
        type: GraphItemTypes.TABLE,

        limit(count) {
            addItem(createLimit(count))
            return this
        },

        atLeast(count) {
            countCondition = createCountCondition(buildContext, '>=', count)
            return this
        },

        agg(builderHandler: (builder: AggBuilder<Fields>) => void) {
            const { builder, result } = createAggBuilder<Fields>(buildContext)
            builderHandler(builder)
            addItem(createAgg(result))
            return this
        },

        throughMany(table, foreignKey?) {
            const initialThrough: ThroughItem = {
                tableName: table,
                foreignKey,
                rel: RelationType.Many,
            }

            return createThroughChain({ buildContext, initialThrough, addTabularSourceItem: addItem })
        },

        throughOne(table, foreignKey?) {
            const initialThrough: ThroughItem = {
                tableName: table,
                foreignKey,
                rel: RelationType.One,
            }
            return createThroughChain({ buildContext, initialThrough, addTabularSourceItem: addItem })
        },

        many<N extends S['tableNames']>(name: N, foreignKeyOrFn: string | TabularSourceBuilder<TableSelectionFromName<S['all'], N>>, builder?: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>) {
            if (typeof foreignKeyOrFn === 'function') {
                return addItem( createNestedTabularSource({ buildContext, name, builder: foreignKeyOrFn }, RelationType.Many) )
            } else {
                return addItem( createNestedTabularSource({ buildContext, name, builder: builder! }, RelationType.Many, foreignKeyOrFn) )
            }
        },

        one<N extends S['tableNames']>(name: N, foreignKeyOrFn: string | TabularSourceBuilder<TableSelectionFromName<S['all'], N>>, builder?: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>) {
            if (typeof foreignKeyOrFn === 'function') {
                return addItem( createNestedTabularSource({ buildContext, name, builder: foreignKeyOrFn }, RelationType.One) )
            } else {
                return addItem( createNestedTabularSource({ buildContext, name, builder: builder! }, RelationType.One, foreignKeyOrFn) )
            }
        },

        where<N extends TableFieldNames<Fields>>(nameOrBuilderHandler: N | ((builder: WhereBuilder<Fields>) => void), sign?: ValidComparisonSign, value?: Fields[N]) {
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
            })
        }
    }

    builder?.(instance as (TabularSource<S> & TabularSourcePlugins))

    return instance
}