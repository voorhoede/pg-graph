import { n, json, JoinType } from "../../sql-ast"
import { RelationType } from "../types"
import { createBaseTabularSource } from "./base-tabular-source"
import { ThroughCollection, ThroughItem } from "./through-chain"
import { TabularSourceOptions } from "./types"
import { exhaustiveCheck } from "../../utils"
import * as joinHelpers from './join-helpers'
import { itemsToSql } from "./items-to-sql"

export function createNestedTabularSource(options: TabularSourceOptions, relType: RelationType, foreignKey?: string, through?: ThroughCollection) {
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
                let lastThroughItem: ThroughItem | undefined;
                let lastThroughTableRef: n.TableRefWithAlias | undefined;

                for (let throughItem of [...through].reverse()) {
                    const throughTableRef = new n.TableRefWithAlias(new n.TableRef(throughItem.tableName), ctx.genTableAlias(throughItem.tableName))
                    const prevRel = lastThroughItem?.rel ?? RelationType.Many;
                    let comparison: n.Compare;

                    if (prevRel === RelationType.One) {
                        comparison = joinHelpers.createPointsToComparison(
                            throughTableRef,
                            lastThroughTableRef ?? subStatement.source,
                            throughItem.foreignKey,
                        )
                    } else if (prevRel === RelationType.Many) {
                        comparison = joinHelpers.createPointsToComparison(
                            lastThroughTableRef ?? subStatement.source,
                            throughTableRef,
                            lastThroughItem?.foreignKey ?? foreignKey,
                        )
                    } else {
                        exhaustiveCheck(prevRel)
                    }

                    subStatement.joins.push(new n.Join(
                        JoinType.INNER_JOIN,
                        throughTableRef,
                        comparison,
                    ))

                    lastThroughTableRef = throughTableRef
                    lastThroughItem = throughItem
                }

                if (lastThroughItem?.rel === RelationType.Many) {
                    groupByField = joinHelpers.getPointsToColumnRef(lastThroughTableRef!, parentTable.ref, lastThroughItem!.foreignKey)
                } else {
                    groupByField = joinHelpers.getOwnColumnRef(lastThroughTableRef!)

                    joinComparison = new n.Compare(
                        joinHelpers.getPointsToColumnRef(parentTable, lastThroughTableRef!, lastThroughItem?.foreignKey),
                        '=',
                        derivedTable.ref().column(json.createHiddenFieldName('group')),
                    )
                }
            }

            subStatement.fields.set(json.createHiddenFieldName('group'), groupByField)
            subStatement.groupBys.push(groupByField)

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
                if (source.rel === RelationType.Many) {
                    subStatement.addWhereClause(
                        joinHelpers.createPointsToComparison(
                            subStatement.source,
                            parentTable,
                            source.foreignKey
                        )
                    )
                } else {
                    subStatement.addWhereClause(
                        joinHelpers.createPointsToComparison(
                            parentTable,
                            subStatement.source,
                            source.foreignKey
                        )
                    )
                }
                subStatement.limit = 1

                let lastThroughItem: ThroughItem | undefined;
                let lastThroughTableRef: n.TableRefWithAlias | undefined;

                for (let throughItem of remainingThroughItems) {
                    const throughTableRef = new n.TableRefWithAlias(new n.TableRef(throughItem.tableName), ctx.genTableAlias(throughItem.tableName))
                    let comparison: n.Compare;

                    if (throughItem.rel === RelationType.One) {
                        comparison = joinHelpers.createPointsToComparison(
                            lastThroughTableRef ?? subStatement.source,
                            throughTableRef,
                            throughItem.foreignKey,
                        )
                    } else if (throughItem.rel === RelationType.Many) {
                        comparison = joinHelpers.createPointsToComparison(
                            throughTableRef,
                            lastThroughTableRef ?? subStatement.source,
                            lastThroughItem?.foreignKey ?? foreignKey,
                        )
                    } else {
                        exhaustiveCheck(throughItem.rel)
                    }

                    subStatement.joins.push(new n.Join(
                        JoinType.INNER_JOIN,
                        throughTableRef,
                        comparison,
                    ))

                    lastThroughTableRef = throughTableRef
                    lastThroughItem = throughItem
                }

                subStatement.joins.push(new n.Join(
                    JoinType.INNER_JOIN,
                    targetTable,
                    joinHelpers.createPointsToComparison(
                        lastThroughTableRef ?? subStatement.source,
                        targetTable,
                        foreignKey,
                    )
                ))

                const lateralAlias = subCtx.genTableAlias(targetTable.ref.name)

                statement.joins.push(new n.Join(
                    JoinType.LEFT_JOIN_LATERAL,
                    new n.DerivedTable(subStatement, lateralAlias),
                    n.Identifier.true,
                ))

                json.addField(statement, 'data', name, new n.Column('data', lateralAlias))

            } else {

                statement.joins.push(new n.Join(
                    JoinType.LEFT_JOIN,
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
