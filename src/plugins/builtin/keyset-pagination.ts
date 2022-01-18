import { GraphBuildContext } from '../../graph/context'
import { Item, TabularSource } from '../../graph/tabular-source'
import { toSqlKey } from '../../graph/types'
import { n, OrderDirection } from '../../sql-ast'
import { Plugin, PluginType } from '../utils'

type KeysetPaginationOptions = {
    pageSize: number,
    cursor?: string,
}

function createPaginationItem(ctx: GraphBuildContext, options: KeysetPaginationOptions): Item {
    function getDecodedCursor(cursor: string): any {
        return JSON.parse(Buffer.from(cursor, 'base64').toString())
    }

    function getOrderByColumns(statement: n.SelectStatement): n.Column[] {
        // get existing order by columns. Currently we only look at the first one
        const [oldOrderByColumn] = statement.orderByColumns
            .filter(orderCol => orderCol.column instanceof n.Column)

        const columns = [new n.Column('id')]
        if (oldOrderByColumn) {
            columns.unshift(oldOrderByColumn.column as n.Column)
        }

        return columns
    }

    function createPagePlusOneQuery(statement: n.SelectStatement, decodedCursor?: any) {
        const selectPagePlusOne = new n.SelectStatement()
        selectPagePlusOne.source = statement.source
        selectPagePlusOne.fields.set(Symbol(), new n.All())

        // get the row count through a window function
        selectPagePlusOne.fields.set('rowCount',
            new n.WindowFunc(new n.AggCall('count', [new n.All()]))
        )

        const columns = getOrderByColumns(statement)

        // we order by a composite type. Which is a combination of multiple values
        const orderByComposite = new n.CompositeType(...columns)
        const orderDirection = statement.orderByColumns[0]?.mode

        // we request the page + 1 extra. The extra row is used to determine if there is one additional page after the requested one
        selectPagePlusOne.limit = options.pageSize + 1
        selectPagePlusOne.orderByColumns = [
            new n.OrderByColumn(orderByComposite, orderDirection)
        ]

        // if we have a decodedCursor then add it as a where clause
        if (decodedCursor) {
            const compositeValues = columns.map(col => ctx.createPlaceholderForValue(decodedCursor[col.name]))

            const operator = orderDirection === OrderDirection.DESC ? '<' : '>='

            selectPagePlusOne.addWhereClause(
                new n.Compare(
                    orderByComposite,
                    operator,
                    new n.CompositeType(...compositeValues)
                )
            )
        }

        const ctePagePlusOne = new n.Cte(
            'pagination_page_plus_one',
            selectPagePlusOne
        )

        // remove the order by columns as they are included in a different query
        statement.orderByColumns = []
        statement.ctes.set(ctePagePlusOne.name, ctePagePlusOne)

        return new n.TableRef(ctePagePlusOne.name)
    }

    function createMetadataQuery(statement: n.SelectStatement, ctePagePlusOneRef: n.TableRef) {
        const columns = getOrderByColumns(statement)

        const selectMetaData = new n.SelectStatement()
        selectMetaData.fields.set(Symbol(),
            new n.FuncCall('jsonb_build_object',
                new n.RawValue('next'), new n.FuncCall('encode',
                    new n.Cast(
                        new n.Cast(
                            new n.FuncCall('jsonb_build_object',
                                ...columns.map(col => {
                                    return [
                                        new n.RawValue(col.name),
                                        new n.Column(col.name)
                                    ]
                                }).flat()
                            ),
                            'text'
                        ),
                        'bytea'
                    ),
                    new n.RawValue('base64')
                ),
                new n.RawValue('prev'), options.cursor ? ctx.createPlaceholderForValue(options.cursor) : n.Identifier.null,
                new n.RawValue('rowCount'), new n.Column('rowCount'),
            )
        )
        selectMetaData.source = ctePagePlusOneRef
        selectMetaData.offset = 1
        selectMetaData.limit = 1

        statement.fields.set('pagination', new n.Subquery(selectMetaData))

        return selectMetaData
    }

    function createFinalPageResultsQuery(statement: n.SelectStatement, ctePagePlusOneRef: n.TableRef) {
        const selectExactPageSize = new n.SelectStatement()
        selectExactPageSize.limit = options.pageSize
        selectExactPageSize.source = ctePagePlusOneRef
        selectExactPageSize.fields.set(Symbol(), new n.All())

        statement.source = new n.DerivedTable(
            selectExactPageSize,
            (statement.source as n.TableRefWithAlias).alias
        )
    }

    return {
        type: 'paginationItem',
        order: 1,
        [toSqlKey](statement, _ctx) {
            const decodedCursor = options.cursor ? getDecodedCursor(options.cursor) : undefined
            const ctePagePlusOneRef = createPagePlusOneQuery(statement, decodedCursor)
            createMetadataQuery(statement, ctePagePlusOneRef)
            createFinalPageResultsQuery(statement, ctePagePlusOneRef)
        }
    }
}

declare module '../../graph/tabular-source' {
    interface TabularSourcePlugins {
        keysetPagination(options: KeysetPaginationOptions): TabularSource
    }
}

export function keysetPagination(): Plugin {
    return {
        type: PluginType.TabularSource,
        mount(ctx) {
            return {
                keysetPagination(this: TabularSource, options: KeysetPaginationOptions) {
                    ctx.addItem(createPaginationItem(ctx.buildContext, options))
                    return this
                }
            }
        }
    }
}
