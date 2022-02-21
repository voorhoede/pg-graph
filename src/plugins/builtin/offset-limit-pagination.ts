import { GraphBuildContext } from '../../graph/context'
import { Item, TabularSource } from '../../graph/tabular-source/types'
import { toSqlKey } from '../../graph/types'
import { JoinType, json, n, OrderDirection } from '../../sql-ast'
import { Plugin, PluginType } from '../utils'

/**
 * This is the most simple form of pagination 
 * 
 * It uses offset and limit and can be used if the pagination is very simple and there are not a lot of pages
 * However offset limit pagination does not really scale -> https://use-the-index-luke.com/sql/partial-results/fetch-next-page
 */

type OffsetLimitPaginationOptions = {
    pageSize: number,
    page: number,
}

const defaultPaginationOptions: OffsetLimitPaginationOptions = {
    pageSize: 30,
    page: 1
}

const groupName = 'pagination'

function parseUint(value: any, fallback: number): number {
    const num = value * 1
    if (Number.isNaN(num)) {
        return fallback
    }
    return num >= 1 ? value : fallback
}

function createPaginationItem(buildContext: GraphBuildContext, options: OffsetLimitPaginationOptions): Item {
    return {
        type: 'paginationItem',
        order: 1,
        [toSqlKey](statement, _ctx) {
            const pageSize = parseUint(options.pageSize, defaultPaginationOptions.pageSize)
            const page = parseUint(options.page, defaultPaginationOptions.page)

            const originalSourceRef = statement.source as n.TableRef

            // Create a cte which defines a constant table with a valid page and pageSize.
            // Currently that only means that the page and pageSize is at least 1
            const constantsStatement = new n.SelectStatement()
            constantsStatement.fields.set('page', new n.FuncCall('greatest', new n.RawValue(1), buildContext.createPlaceholderForValue(page)))
            constantsStatement.fields.set('pageSize', new n.FuncCall('greatest', new n.RawValue(1), buildContext.createPlaceholderForValue(pageSize)))
            const constantsCte = new n.Cte('constants', constantsStatement)
            statement.ctes.set(constantsCte.name, constantsCte)

            // we replace the original source by the constant cte...
            statement.source = constantsCte.ref()

            // ...and cross join it with the select from the original source
            // now every row in the result will have the pageSize and page
            // we use a cross join lateral so that we can reference the pageSize and page from the constants table
            const selectWithLimit = new n.SelectStatement()
            selectWithLimit.source = originalSourceRef
            selectWithLimit.fields.set(Symbol(), new n.All())
            selectWithLimit.fields.set('rowCount', new n.WindowFunc(new n.AggCall('count', [new n.All()])))
            selectWithLimit.limit = constantsCte.column('pageSize')
            selectWithLimit.offset = new n.Operator(
                new n.Group(new n.Operator(constantsCte.column('page'), '-', new n.RawValue(1))),
                '*',
                constantsCte.column('pageSize'),
            );

            // we move the ordering to the sub select. Pagination without ordering does not really make sense in a sql database so make sure to warn the user about that
            if (statement.orderByColumns.length === 0) {
                console.warn('(OffsetLimitPagination) No order was specified. This is needed for correct pagination therefore we will add "id" as the order by column')
                selectWithLimit.orderByColumns.push(new n.OrderByColumn(new n.Column('id'), OrderDirection.DESC))
            } else {
                statement.copyOrderBysTo(selectWithLimit)
                statement.orderByColumns.length = 0
            }

            // we move the where clause to the sub select. It's very important that the rowCount / pageSize is based on user provided filters
            statement.copyWhereClauseTo(selectWithLimit)
            statement.clearWhereClause()

            const derivedSelectWithLimit = new n.DerivedTable(selectWithLimit, originalSourceRef.name)

            statement.joins.push(new n.Join(JoinType.CROSS_JOIN_LATERAL, derivedSelectWithLimit))

            // group by is needed because we need to access page and pageSize while aggregrating all other values
            statement.groupBys.push(constantsCte.column('page'), constantsCte.column('pageSize'), derivedSelectWithLimit.column('rowCount'))

            json.addField(statement, groupName, 'pageCount', new n.FuncCall('ceil',
                new n.Operator(
                    derivedSelectWithLimit.column('rowCount'),
                    '/',
                    new n.Cast(constantsCte.column('pageSize'), 'float') // cast to float is needed to prevent pg from rounding down
                )
            ))
            json.addField(statement, groupName, 'rowCount', derivedSelectWithLimit.column('rowCount'))
            json.addField(statement, groupName, 'page', constantsCte.column('page'))
            json.addField(statement, groupName, 'pageSize', constantsCte.column('pageSize'))
        }
    }
}

declare module '../../graph/tabular-source/types' {
    interface TabularSourcePlugins {
        pagination(options: OffsetLimitPaginationOptions): TabularSource
    }
}

export function offsetLimitPagination(): Plugin {
    return {
        type: PluginType.TabularSource,
        mount(ctx) {
            return {
                pagination(this: TabularSource, options: OffsetLimitPaginationOptions = defaultPaginationOptions) {
                    ctx.addItem(createPaginationItem(ctx.buildContext, options))
                    return this
                }
            }
        }
    }
}
