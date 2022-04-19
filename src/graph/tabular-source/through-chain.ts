import { GraphBuildContext } from "../context"
import { RelationType } from "../types"
import { Item, TabularChain, TabularSource, TabularSourceBuilder } from "./types"
import { createNestedTabularSource } from "./nested-tabular-source"
import { TableLike } from "../../type-utils"

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

export function createThroughChain<T extends TableLike>({ buildContext, initialThrough, addTabularSourceItem }: CreateThroughChainOptions): TabularChain<T> {
    const throughs: ThroughCollection = [initialThrough]

    return {
        throughMany(table: string, foreignKey?: string) {
            throughs.push({
                tableName: table,
                foreignKey,
                rel: RelationType.Many,
            })
            return this
        },
        throughOne(table: string, foreignKey?: string) {
            throughs.push({
                tableName: table,
                foreignKey,
                rel: RelationType.One,
            })
            return this
        },
        many(tableOrView: string, foreignKeyOrFn: TabularSourceBuilder<T> | string, builder?: TabularSourceBuilder<T>): TabularSource<T> {
            let item: TabularSource<T>;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: foreignKeyOrFn }, RelationType.Many, undefined, throughs);
            } else {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: builder! }, RelationType.Many, foreignKeyOrFn, throughs);
            }
            addTabularSourceItem(item)
            return item
        },
        one(tableOrView: string, foreignKeyOrFn: TabularSourceBuilder<T> | string, builder?: TabularSourceBuilder<T>): TabularSource<T> {
            let item: TabularSource<T>;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: foreignKeyOrFn }, RelationType.One, undefined, throughs);
            } else {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: builder! }, RelationType.One, foreignKeyOrFn, throughs);
            }
            addTabularSourceItem(item)
            return item
        }
    }
}