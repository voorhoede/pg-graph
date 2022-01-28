import { JoinType, n } from "../../sql-ast"
import { GraphBuildContext, GraphToSqlContext } from "../context"
import { RelationType } from "../types"
import { Item, TabularChain, TabularSource, TabularSourceBuilder } from "./types"
import * as joinHelpers from './join-helpers'
import { createNestedTabularSource } from "./nested-tabular-source"
import { exhaustiveCheck } from "../../utils"

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

export function createThroughChain({ buildContext, initialThrough, addTabularSourceItem }: CreateThroughChainOptions): TabularChain {
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
        many(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ buildContext, name, builder: foreignKeyOrFn }, RelationType.Many, undefined, throughs);
            } else {
                item = createNestedTabularSource({ buildContext, name, builder: builder! }, RelationType.Many, foreignKeyOrFn, throughs);
            }
            addTabularSourceItem(item)
            return item
        },
        one(name: string, foreignKeyOrFn: TabularSourceBuilder | string, builder?: TabularSourceBuilder): TabularSource {
            let item: TabularSource;
            if (typeof foreignKeyOrFn === 'function') {
                item = createNestedTabularSource({ buildContext, name, builder: foreignKeyOrFn }, RelationType.One, undefined, throughs);
            } else {
                item = createNestedTabularSource({ buildContext, name, builder: builder! }, RelationType.One, foreignKeyOrFn, throughs);
            }
            addTabularSourceItem(item)
            return item
        }
    }
}

type Target = {
    tableRef: n.TableRef,
    foreignKey?: string,
    rel: RelationType,
}