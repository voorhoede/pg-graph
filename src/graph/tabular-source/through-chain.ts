import { GraphBuildContext } from "../context"
import { RelationType } from "../types"
import { Item, TabularChain } from "./types"
import { createNestedTabularSource } from "./nested-tabular-source"
import { TableSelection } from "../../type-utils"

export type ThroughItem = {
    tableName: string,
    foreignKey?: string,
    rel: RelationType,
}

export type ThroughCollection = ThroughItem[]

type CreateThroughChainOptions = {
    buildContext: GraphBuildContext,
    initialThrough: ThroughItem,
    addTabularSourceItem(item: Item): void;
}

export function createThroughChain<S extends TableSelection>({ buildContext, initialThrough, addTabularSourceItem }: CreateThroughChainOptions) {
    const throughs: ThroughCollection = [initialThrough]

    const chain: TabularChain<S> = {
        throughMany(table, foreignKey?) {
            throughs.push({
                tableName: table,
                foreignKey,
                rel: RelationType.Many,
            })
            return this as any
        },
        throughOne(table, foreignKey?) {
            throughs.push({
                tableName: table,
                foreignKey,
                rel: RelationType.One,
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