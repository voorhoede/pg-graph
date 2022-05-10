import { n, json, JoinType } from "../../sql-ast"
import { RelationType } from "../types"
import { createBaseTabularSource } from "./base-tabular-source"
import { ThroughCollection } from "./through-chain"
import { JoinStrategy, TabularSourceOptions } from "./types"
import { exhaustiveCheck } from "../../utils"
import * as joinHelpers from './join-helpers'
import { itemsToSql } from "./items-to-sql"
import { GraphToSqlContext } from "../context"
import { TableSelection } from "../../type-utils"

export function createNestedTabularSource<S extends TableSelection>(options: TabularSourceOptions<S>, relType: RelationType, foreignKey?: string, through?: ThroughCollection) {
    return createBaseTabularSource(options, ({ targetTableName, statement, ctx, items, name, countCondition, toSqlHints }) => {
        const parentTable = ctx.table!
        const targetTable = new n.TableRefWithAlias(new n.TableRef(targetTableName), ctx.genTableAlias(targetTableName))

        const subCtx = ctx.createSubContext()
        subCtx.table = targetTable;

        const subStatement = new n.SelectStatement()

        itemsToSql(items, subStatement, subCtx)

        // we can only use a one to one relation when the requested relation is one AND the through chain does not contain a many
        const oneToOneRelation = relType === RelationType.One && !through?.some(item => item.rel === RelationType.Many)

        if(oneToOneRelation) {
            if (through?.length) {
                createJoinsForThroughChain({
                    ctx: subCtx,
                    relType, 
                    statement,
                    through,
                    foreignKey,
                })
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
            }

            if(subStatement.orderByColumns.length) {
                console.warn('Warning: Order by has no effect for one to one relations')
            }
    
            // we only copy the where clause to the primary statement. All other stuff has no effect on a one to one relation
            subStatement.copyWhereClauseTo(statement)
    
            json.copyFieldsInto(subStatement, statement, 'data', name)
        } else {
            if (through?.length) {
                createJoinsForThroughChain({
                    ctx: subCtx,
                    relType, 
                    statement: subStatement,
                    through,
                    foreignKey,
                })

                /**
                 * The first through item will be connected to the parent table.
                 * So we adopt it's rel and foreignKey
                 */
                const firstThrough = through[0]

                relType = firstThrough.rel
                foreignKey = firstThrough!.foreignKey
            } else {
                subStatement.source = subCtx.table!
            }

            json.convertDataFieldsToAgg(subStatement)

            // here we add a having clause when the count is at least 2. For a count of one a INNER_JOIN does the job.
            if (countCondition?.requiresAtLeast(2)) {
                countCondition.toSql(subStatement, targetTable.name)
            }
            
            const derivedTable = new n.DerivedTable(subStatement, subCtx.genTableAlias(targetTable.ref.name))
    
            connectDerivedTableToParent({
                joinStrategy: toSqlHints.joinStrategy,
                statement,
                derivedTable,
                parentTable,
                inner: !!countCondition?.requiresAtLeast(1),
                relType,
                foreignKey,
                srcTable: subStatement.source!,
            })
    
            json.addReferencesToChildFields({
                src: derivedTable,
                dest: statement,
                withPrefix: name,
            })
        }

    })
}

type CreateJoinsForThroughChainOptions = {
    statement: n.SelectStatement,
    relType: RelationType,
    through: ThroughCollection,
    ctx: GraphToSqlContext,
    foreignKey?: string;
}

function createJoinsForThroughChain({ ctx, relType, statement, through, foreignKey }: CreateJoinsForThroughChainOptions) {
    if(!through.length) {
        return;
    }

    let prevRef: n.TableRefWithAlias | undefined = undefined;

    for(let item of through) {
        if(!prevRef && !statement.source) {
            const sourceTableAlias = ctx.genTableAlias(item.tableName)
            statement.source = new n.TableRefWithAlias(new n.TableRef(item.tableName), sourceTableAlias)

            if(item.whereBuilderResult?.node) {
                item.whereBuilderResult.setTableContext(statement.source)
                statement.addWhereClause(item.whereBuilderResult.node)
            }
            
            continue;
        }

        const ref = new n.TableRefWithAlias(new n.TableRef(item.tableName), ctx.genTableAlias(item.tableName))
        let comparison: n.Compare;

        if (item.rel === RelationType.One) {
            comparison = joinHelpers.createPointsToComparison(
                prevRef ?? statement.source as n.TableRefWithAlias,
                ref,
                item.foreignKey,
            )
        } else if (item.rel === RelationType.Many) {
            comparison = joinHelpers.createPointsToComparison(
                ref,
                prevRef ?? statement.source as n.TableRefWithAlias,
                item.foreignKey,
            )
        } else {
            exhaustiveCheck(item.rel)
        }

        if(item.whereBuilderResult?.node) {
            item.whereBuilderResult.setTableContext(ref)
            statement.addWhereClause(item.whereBuilderResult.node)
        }

        statement.joins.push(new n.Join(
            JoinType.INNER_JOIN,
            ref,
            comparison,
        ))

        prevRef = ref;
    }

    const srcTable = prevRef ?? statement.source as n.TableRefWithAlias;
    const destTable = ctx.table!

    const [firstCol, secondCol] = relType === RelationType.Many ? [destTable, srcTable] : [srcTable, destTable];

    statement.joins.push(new n.Join(
        JoinType.INNER_JOIN,
        destTable,
        joinHelpers.createPointsToComparison(
            firstCol,
            secondCol,
            foreignKey,
        )
    ))
}

type ConnectDerivedTableOptions = {
    joinStrategy: JoinStrategy,
    statement: n.SelectStatement,
    derivedTable: n.DerivedTable,
    parentTable: n.TableRefWithAlias,
    relType: RelationType,
    inner: boolean,
    foreignKey?: string,
    srcTable: n.TableRef | n.DerivedTable,
}

function connectDerivedTableToParent({
    joinStrategy,
    statement,
    derivedTable,
    parentTable,
    relType,
    inner,
    srcTable,
    foreignKey
}: ConnectDerivedTableOptions) {
    let srcTableRef = srcTable instanceof n.DerivedTable ? srcTable.ref() : srcTable

    if(joinStrategy === 'lateral') {
        /**
         * Create a lateral join where we basically only add a where clause connecting the srcTable to the parentTable
         * And a 'INNER JOIN LATERAL' or 'LEFT JOIN LATERAL'
         */
        
        const [firstCol, secondCol] = relType === RelationType.Many ? [srcTableRef, parentTable] : [parentTable, srcTableRef];
    
        (derivedTable.select as n.SelectStatement).addWhereClause(
            joinHelpers.createPointsToComparison(
                firstCol as n.TableRef,
                secondCol as n.TableRef,
                foreignKey
            )
        )
    
        statement.joins.push(new n.Join(
            inner ? JoinType.INNER_JOIN_LATERAL : JoinType.LEFT_JOIN_LATERAL,
            derivedTable,
            n.Identifier.true,
        ))
    } else if(joinStrategy === 'agg') {
        /**
         * Create a agg join where we add a GROUP BY field and a INNER JOIN or LEFT JOIN to connect the derived table to the parent table
         */
        
        let groupByField: n.Column;
        let joinComparison: n.Compare;

        if(relType === RelationType.One) {
            groupByField = joinHelpers.getOwnColumnRef(srcTableRef)

            joinComparison = new n.Compare(
                joinHelpers.getPointsToColumnRef(parentTable, srcTableRef, foreignKey),
                '=',
                derivedTable.ref().column(json.createHiddenFieldName('group')),
            )
        } else {
            groupByField = joinHelpers.getPointsToColumnRef(srcTableRef, parentTable.ref, foreignKey)

            joinComparison = joinHelpers.createPointsToComparison(
                derivedTable.ref(),
                parentTable,
                json.createHiddenFieldName('group'),
            )
        }

        const select = derivedTable.select as n.SelectStatement
        select.fields.set(json.createHiddenFieldName('group'), groupByField);
        select.groupBys.push(groupByField)

        statement.joins.push(new n.Join(
            inner ? JoinType.INNER_JOIN : JoinType.LEFT_JOIN,
            derivedTable,
            joinComparison
        ));
    } else {
        exhaustiveCheck(joinStrategy)
    }

    
}