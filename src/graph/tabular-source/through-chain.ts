import { GraphBuildContext } from "../context"
import { RelationType } from "../types"
import { Item, TableSelection, TableSelectionFromName, TabularChain, TabularSource, TabularSourceBuilder } from "./types"
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

export function createThroughChain<S extends TableSelection>({ buildContext, initialThrough, addTabularSourceItem }: CreateThroughChainOptions) {
    const throughs: ThroughCollection = [initialThrough]

    const chain: TabularChain<S> = {
        throughMany(table, foreignKey?) {
            throughs.push({
                tableName: table,
                foreignKey,
                rel: RelationType.Many,
            })
            return this
        },
        throughOne(table, foreignKey?) {
            throughs.push({
                tableName: table,
                foreignKey,
                rel: RelationType.One,
            })
            return this
        },
        many<N extends S['tableNames']>(tableOrView: N, foreignKeyOrFn: string | TabularSourceBuilder<TableSelectionFromName<S['all'], N>>, builder?: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>) {
            let item: TabularSource<TableSelectionFromName<S['all'], N>>;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: foreignKeyOrFn }, RelationType.Many, undefined, throughs);
            } else {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: builder! }, RelationType.Many, foreignKeyOrFn, throughs);
            }
            addTabularSourceItem(item)
            return item
        },
        one<N extends S['tableNames']>(tableOrView: N, foreignKeyOrFn: string | TabularSourceBuilder<TableSelectionFromName<S['all'], N>>, builder?: TabularSourceBuilder<TableSelectionFromName<S['all'], N>>) {
            let item: TabularSource<TableSelectionFromName<S['all'], N>>;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: foreignKeyOrFn }, RelationType.One, undefined, throughs);
            } else {
                item = createNestedTabularSource({ buildContext, name: tableOrView, builder: builder! }, RelationType.One, foreignKeyOrFn, throughs);
            }
            addTabularSourceItem(item)
            return item
        }
    }

    return chain;
}