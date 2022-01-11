import { Item, TabularSource } from '../../graph/tabular-source'
import { toSqlKey } from '../../graph/types'
import { json, n } from '../../sql-ast'
import { Plugin, PluginType } from '../utils'

/**
 * This is the most simple form of pagination 
 * 
 * It uses offset and limit
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
    return num >= 0 ? value : fallback
}

function createPaginationItem(options: OffsetLimitPaginationOptions): Item {
    return {
        type: 'paginationItem',
        [toSqlKey](statement, ctx) {
            const pageSize = parseUint(options.pageSize, defaultPaginationOptions.pageSize)
            const page = parseUint(options.page, defaultPaginationOptions.page)

            statement.limit = pageSize

            const subCount = new n.SelectStatement()
            subCount.source = new n.TableRef(ctx.table!)

            subCount.fields.set('pageCount',
                new n.FuncCall('ceil',
                    new n.Operator(
                        new n.AggCall('count', [new n.All()]),
                        '/',
                        new n.RawValue(pageSize, 'float')
                    )
                )
            )

            const subQuery = new n.Subquery(
                subCount
            )

            json.addField(statement, groupName, 'pageCount', subQuery)
            json.addField(statement, groupName, 'rowCount', new n.AggCall('count', [new n.All()]))
            json.addField(statement, groupName, 'page', new n.RawValue(page, 'int'))
            json.addField(statement, groupName, 'pageSize', new n.RawValue(pageSize, 'float'))
        }
    }
}

declare module '../../graph/tabular-source' {
    interface TabularSourcePlugins {
        pagination(offset: number): TabularSource
    }
}

export function offsetLimitPagination(options: OffsetLimitPaginationOptions = defaultPaginationOptions): Plugin {
    return {
        type: PluginType.TabularSource,
        mount(ctx) {
            return {
                pagination(this: TabularSource) {
                    ctx.addItem(createPaginationItem(options))
                    return this
                }
            }
        }
    }
}
