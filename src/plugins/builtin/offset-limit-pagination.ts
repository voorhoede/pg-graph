import { Item, TabularSource } from '../../graph/tabular-source/types'
import { toSqlKey } from '../../graph/types'
import { json, n } from '../../sql-ast'
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

function parseUint(value: any, fallback: number) {
    const num = value * 1
    if (Number.isNaN(num)) {
        return fallback
    }
    return num >= 1 ? value : fallback
}

function createPaginationItem(options: OffsetLimitPaginationOptions): Item {
    return {
        type: 'paginationItem',
        [toSqlKey](statement, ctx) {
            const pageSize = parseUint(options.pageSize, defaultPaginationOptions.pageSize)
            const page = parseUint(options.page, defaultPaginationOptions.page)

            statement.limit = pageSize
            statement.offset = page * pageSize

            const subCount = new n.SelectStatement()
            subCount.source = ctx.table

            subCount.fields.set('pageCount',
                new n.FuncCall('ceil',
                    new n.Operator(
                        new n.AggCall('count', [new n.All()]),
                        '/',
                        new n.Cast(new n.RawValue(pageSize), 'float')
                    )
                )
            )

            const subQuery = new n.Subquery(
                subCount
            )

            json.addField(statement, groupName, 'pageCount', subQuery)
            json.addField(statement, groupName, 'rowCount', new n.AggCall('count', [new n.All()]))
            json.addField(statement, groupName, 'page', new n.Cast(new n.RawValue(page), 'int'))
            json.addField(statement, groupName, 'pageSize', new n.Cast(new n.RawValue(pageSize), 'float'))
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
                    ctx.addItem(createPaginationItem(options))
                    return this
                }
            }
        }
    }
}
