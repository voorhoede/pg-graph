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

export function applyThroughItemsToStatement(ctx: GraphToSqlContext, statement: n.SelectStatement, items: ThroughCollection, targetTableRef: n.TableRef, targetForeignKey?: string): [n.TableRefWithAlias | undefined, ThroughItem | undefined] {
    let prevThroughItem: ThroughItem | undefined;
    let prevThroughTableRef: n.TableRefWithAlias | undefined;

    for (let throughItem of items) {
        const throughTableAlias = ctx.genTableAlias(throughItem.tableName)
        const throughTableRef = new n.TableRefWithAlias(new n.TableRef(throughItem.tableName), throughTableAlias)

        if (throughItem.rel === RelationType.One) {
            statement.joins.push(new n.Join(
                JoinType.INNER_JOIN,
                throughTableRef,
                joinHelpers.createPointsToComparison(
                    throughTableRef,
                    prevThroughTableRef ?? targetTableRef,
                    throughItem.foreignKey,
                )
            ))
        } else if (throughItem.rel === RelationType.Many) {
            statement.joins.push(new n.Join(
                JoinType.INNER_JOIN,
                throughTableRef,
                joinHelpers.createPointsToComparison(
                    prevThroughTableRef ?? targetTableRef,
                    throughTableRef,
                    prevThroughItem?.foreignKey ?? targetForeignKey,
                )
            ))
        } else {
            exhaustiveCheck(throughItem.rel)
        }

        prevThroughTableRef = throughTableRef
        prevThroughItem = throughItem
    }

    return [prevThroughTableRef, prevThroughItem]
}