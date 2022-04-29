import { GraphBuildContext } from "../context"
import { RelationType } from "../types"
import { Item, TabularChain } from "./types"
import { createNestedTabularSource } from "./nested-tabular-source"
import { TableSelection } from "../../type-utils"
import { createWhereBuilder, WhereBuilderHandler, WhereBuilderResult } from "../where-builder"

export type ThroughItem = {
    tableName: string,
    foreignKey?: string,
    rel: RelationType,
    whereBuilderResult?: WhereBuilderResult
}

export type ThroughCollection = ThroughItem[]

type CreateThroughChainOptions = {
    buildContext: GraphBuildContext,
    addTabularSourceItem(item: Item): void;
}

export function createThroughChain<S extends TableSelection>({ buildContext, addTabularSourceItem }: CreateThroughChainOptions) {
    const throughs: ThroughCollection = []

    function getWhereBuilderResult(handler?: WhereBuilderHandler<S['fields']>): WhereBuilderResult | undefined {
        if(!handler) {
            return undefined
        }
        const whereBuilder = createWhereBuilder<S['fields']>(buildContext)
        handler(whereBuilder.builder)
        
        return whereBuilder.result
    }

    const chain: TabularChain<S> = {
        throughMany(table, foreignKey?, whereBuilderHandler?) {
            if(typeof foreignKey === 'function') {
                whereBuilderHandler = foreignKey
                foreignKey = undefined
            }

            throughs.push({
                tableName: table,
                foreignKey,
                rel: RelationType.Many,
                whereBuilderResult: getWhereBuilderResult(whereBuilderHandler as any),
            })
            return this as any
        },
        throughOne(table, foreignKey?, whereBuilderHandler?) {
            if(typeof foreignKey === 'function') {
                whereBuilderHandler = foreignKey
                foreignKey = undefined
            }

            throughs.push({
                tableName: table,
                foreignKey,
                rel: RelationType.One,
                whereBuilderResult: getWhereBuilderResult(whereBuilderHandler as any),
            })
            return this as any
        },
        many(tableOrView, foreignKeyOrFn, builder?) {
            let item: ReturnType<TabularChain['many']>;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: foreignKeyOrFn }, RelationType.Many, undefined, throughs);
            } else {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: builder as any }, RelationType.Many, foreignKeyOrFn, throughs);
            }
            addTabularSourceItem(item)
            return item
        },
        one(tableOrView, foreignKeyOrFn, builder?) {
            let item: ReturnType<TabularChain['one']>;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: foreignKeyOrFn }, RelationType.One, undefined, throughs);
            } else {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: builder! as any }, RelationType.One, foreignKeyOrFn, throughs);
            }
            addTabularSourceItem(item)
            return item
        }
    }

    return chain;
}