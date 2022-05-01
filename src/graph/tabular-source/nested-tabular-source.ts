import { n, json, JoinType } from "../../sql-ast"
import { RelationType } from "../types"
import { createBaseTabularSource } from "./base-tabular-source"
import { ThroughCollection, ThroughItem } from "./through-chain"
import { TabularSourceOptions } from "./types"
import { exhaustiveCheck } from "../../utils"
import * as joinHelpers from './join-helpers'
import { itemsToSql } from "./items-to-sql"
import { GraphToSqlContext } from "../context"
import { TableSelection } from "../../type-utils"

export function createNestedTabularSource<S extends TableSelection>(options: TabularSourceOptions<S>, relType: RelationType, foreignKey?: string, through?: ThroughCollection) {
    return createBaseTabularSource(options, ({ targetTableName, statement, ctx, items, name, countCondition }) => {
        const parentTable = ctx.table!
        const targetTable = new n.TableRefWithAlias(new n.TableRef(targetTableName), ctx.genTableAlias(targetTableName))

        const subCtx = ctx.createSubContext()
        subCtx.table = targetTable;

        if (relType === RelationType.Many) {
            /*
            Aggregrate before join for complex constructs where we are nested a couple of levels
            */

            const subStatement = new n.SelectStatement()
            subStatement.source = subCtx.table!

            itemsToSql(
                items,
                subStatement,
                subCtx
            )

            json.convertDataFieldsToAgg(subStatement)

            const derivedTable = new n.DerivedTable(subStatement, targetTable.name + '_through')

            let groupByField = joinHelpers.getPointsToColumnRef(subStatement.source, parentTable.ref, foreignKey)
            let joinComparison = joinHelpers.createPointsToComparison(
                derivedTable.ref(),
                parentTable,
                json.createHiddenFieldName('group'),
            )

            if (through?.length) {
                // we add the joins in reverse order. The last item (just before the 'many' method call) is the source of the select. The first item will be joined with the parent table.
                const lastItem = throughItemIter([...through].reverse(), ctx, (prev, cur) => {
                    const prevRel = prev.item?.rel ?? RelationType.Many;
                    let comparison: n.Compare;

                    if (prevRel === RelationType.One) {
                        comparison = joinHelpers.createPointsToComparison(
                            cur.tableRef,
                            prev.tableRef ?? subStatement.source as n.TableRefWithAlias,
                            cur.item.foreignKey,
                        )
                    } else if (prevRel === RelationType.Many) {
                        comparison = joinHelpers.createPointsToComparison(
                            prev.tableRef ?? subStatement.source as n.TableRefWithAlias,
                            cur.tableRef,
                            prev.item?.foreignKey ?? foreignKey,
                        )
                    } else {
                        exhaustiveCheck(prevRel)
                    }

                    if(cur.item.whereBuilderResult?.node) {
                        cur.item.whereBuilderResult.setTableContext(cur.tableRef)
                        subStatement.addWhereClause(cur.item.whereBuilderResult.node)
                    }

                    subStatement.joins.push(new n.Join(
                        JoinType.INNER_JOIN,
                        cur.tableRef,
                        comparison,
                    ))
                });

                if (lastItem.item.rel === RelationType.Many) {
                    groupByField = joinHelpers.getPointsToColumnRef(lastItem.tableRef, parentTable.ref, lastItem.item.foreignKey)
                } else {
                    groupByField = joinHelpers.getOwnColumnRef(lastItem.tableRef)

                    // when the start end of the through chain is a one-to-one relation the join comparison is totally different
                    // suddenly we need to join the parent table using the foreign key of the start end with the hidden _group field exposed by the derived table
                    joinComparison = new n.Compare(
                        joinHelpers.getPointsToColumnRef(parentTable, lastItem.tableRef, lastItem.item.foreignKey),
                        '=',
                        derivedTable.ref().column(json.createHiddenFieldName('group')),
                    )
                }
            }

            subStatement.fields.set(json.createHiddenFieldName('group'), groupByField)
            subStatement.groupBys.push(groupByField)

            // here we add a having clause when the count is at least 2. For a count of one a INNER_JOIN does the job.
            if (countCondition?.requiresAtLeast(2)) {
                countCondition.toSql(subStatement, targetTable.name)
            }

            statement.joins.push(new n.Join(
                countCondition?.requiresAtLeast(1) ? JoinType.INNER_JOIN : JoinType.LEFT_JOIN,
                derivedTable,
                joinComparison
            ))

            json.addReferencesToChildFields({
                src: derivedTable,
                dest: statement,
                withPrefix: name,
            })

        } else if (relType === RelationType.One) {
            /*
                One to one relation
            */

            const subStatement = new n.SelectStatement()

            itemsToSql(items, subStatement, subCtx)

            if (through?.length) {
                const [source, ...remainingThroughItems] = through;

                const sourceTableAlias = ctx.genTableAlias(source.tableName)
                subStatement.source = new n.TableRefWithAlias(new n.TableRef(source.tableName), sourceTableAlias)

                const [firstCol, secondCol] = source.rel === RelationType.Many ? [subStatement.source, parentTable] : [parentTable, subStatement.source]
                subStatement.addWhereClause(
                    joinHelpers.createPointsToComparison(
                        firstCol,
                        secondCol,
                        source.foreignKey
                    )
                )

                if(source.whereBuilderResult?.node) {
                    source.whereBuilderResult.setTableContext(subStatement.source)
                    subStatement.addWhereClause(source.whereBuilderResult.node)
                }

                const lastItem = throughItemIter(remainingThroughItems, ctx, (prev, cur) => {
                    let comparison: n.Compare;

                    if (cur.item.rel === RelationType.One) {
                        comparison = joinHelpers.createPointsToComparison(
                            prev.tableRef ?? subStatement.source as n.TableRefWithAlias,
                            cur.tableRef,
                            cur.item.foreignKey,
                        )
                    } else if (cur.item.rel === RelationType.Many) {
                        comparison = joinHelpers.createPointsToComparison(
                            cur.tableRef,
                            prev.tableRef ?? subStatement.source as n.TableRefWithAlias,
                            prev.item?.foreignKey ?? foreignKey,
                        )
                    } else {
                        exhaustiveCheck(cur.item.rel)
                    }

                    if(cur.item.whereBuilderResult?.node) {
                        cur.item.whereBuilderResult.setTableContext(cur.tableRef)
                        subStatement.addWhereClause(cur.item.whereBuilderResult.node)
                    }

                    subStatement.joins.push(new n.Join(
                        JoinType.INNER_JOIN,
                        cur.tableRef,
                        comparison,
                    ))
                })

                subStatement.joins.push(new n.Join(
                    JoinType.INNER_JOIN,
                    targetTable,
                    joinHelpers.createPointsToComparison(
                        lastItem.tableRef ?? subStatement.source,
                        targetTable,
                        foreignKey,
                    )
                ))

                if(through[through.length-1].rel === RelationType.One) {
                    subStatement.limit = new n.RawValue(1)
                } else {
                    json.convertDataFieldsToAgg(subStatement)
                }

                const derivedTable = new n.DerivedTable(subStatement, subCtx.genTableAlias(targetTable.ref.name))

                statement.joins.push(new n.Join(
                    countCondition?.requiresAtLeast(1) ? JoinType.INNER_JOIN_LATERAL : JoinType.LEFT_JOIN_LATERAL,
                    derivedTable,
                    n.Identifier.true,
                ))

                json.addField(statement, 'data', name, derivedTable.column('data'))

            } else {

                statement.joins.push(new n.Join(
                    countCondition?.requiresAtLeast(1) ? JoinType.INNER_JOIN : JoinType.LEFT_JOIN,
                    targetTable,
                    joinHelpers.createPointsToComparison(
                        parentTable,
                        targetTable,
                        foreignKey,
                    )
                ))

                subStatement.copyWhereClauseTo(statement)

                json.copyFieldsInto(subStatement, statement, 'data', name)
            }

        } else {
            exhaustiveCheck(relType)
        }

    })
}

type ThroughIterItem = { item: ThroughItem, tableRef: n.TableRefWithAlias }
function throughItemIter(items: ThroughCollection, ctx: GraphToSqlContext, cb: (prev: Partial<ThroughIterItem>, cur: ThroughIterItem) => void): ThroughIterItem {
    let prev: Partial<ThroughIterItem> = {}
    for (let item of items) {
        const cur: ThroughIterItem = {
            item,
            tableRef: new n.TableRefWithAlias(new n.TableRef(item.tableName), ctx.genTableAlias(item.tableName))
        }
        cb(prev, cur)
        prev = cur
    }
    return prev as ThroughIterItem
}