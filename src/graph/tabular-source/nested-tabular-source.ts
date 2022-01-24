import { n, json, JoinType } from "../../sql-ast"
import { RelationType } from "../types"
import { createBaseTabularSource } from "./base-tabular-source"
import { applyThroughItemsToStatement, ThroughCollection } from "./through-chain"
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

            let groupByField = joinHelpers.getOneHasOneColumnRef(subStatement.source, parentTable.ref, foreignKey)

            if (through?.length) {
                const [lastThroughTableRef, lastThroughItem] = applyThroughItemsToStatement(
                    ctx,
                    subStatement,
                    [...through].reverse(),
                    targetTable,
                    foreignKey
                )

                groupByField = joinHelpers.getOneHasOneColumnRef(lastThroughTableRef!, parentTable.ref, lastThroughItem!.foreignKey)
            }

            subStatement.fields.set(json.createHiddenFieldName('group'), groupByField)
            subStatement.groupBys.push(groupByField)

            if (countCondition?.requiresAtLeast(2)) {
                countCondition.toSql(subStatement, targetTable.name)
            }

            const derivedTable = new n.DerivedTable(subStatement, targetTable.name + '_through')

            statement.joins.push(new n.Join(
                countCondition?.requiresAtLeast(1) ? JoinType.INNER_JOIN : JoinType.LEFT_JOIN,
                derivedTable,
                joinHelpers.createComparison(
                    RelationType.Many,
                    derivedTable.ref(),
                    parentTable,
                    json.createHiddenFieldName('group'),
                )
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
                subStatement.addWhereClause(
                    joinHelpers.createComparison(
                        source.rel,
                        subStatement.source,
                        parentTable,
                        source.foreignKey
                    )
                )
                subStatement.limit = 1

                const [lastThroughTableRef,] = applyThroughItemsToStatement(
                    ctx,
                    subStatement,
                    remainingThroughItems,
                    subStatement.source
                )

                subStatement.joins.push(new n.Join(
                    JoinType.INNER_JOIN,
                    targetTable,
                    joinHelpers.createComparison(
                        RelationType.One,
                        targetTable,
                        lastThroughTableRef ?? subStatement.source,
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
                    joinHelpers.createComparison(
                        RelationType.One,
                        targetTable,
                        parentTable,
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
