import { GraphBuildContext } from '../../graph/context'
import { Item, TabularSource } from '../../graph/tabular-source/types'
import { toSqlKey } from '../../graph/types'
import { JoinType, n, OrderDirection } from '../../sql-ast'
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

        let columns = [new n.Column('id')]
        if (oldOrderByColumn) {
            if (oldOrderByColumn.column instanceof n.Column && oldOrderByColumn.column.name !== 'id') { // fix the issue where the user already added the id column as a order by column
                columns.unshift(new n.Column(oldOrderByColumn.column.name))
            }
        }

        return columns
    }

    function createConstantsQuery(statement: n.SelectStatement) {
        const constantsStatement = new n.SelectStatement()
        constantsStatement.fields.set('pageSize', new n.FuncCall('greatest', new n.RawValue(1), ctx.createPlaceholderForValue(options.pageSize)))
        const constantsCte = new n.Cte('pagination_constants', constantsStatement)
        statement.ctes.set(constantsCte.name, constantsCte)
        return constantsCte.ref()
    }

    function createFilteredQuery(statement: n.SelectStatement) {
        if (statement.hasWhereClause()) {
            const filterSelect = new n.SelectStatement()
            filterSelect.source = statement.source
            filterSelect.fields.set(Symbol(), new n.All())
            statement.copyWhereClauseTo(filterSelect)

            const cteFiltered = new n.Cte('pagination_filtered', filterSelect, true)
            statement.ctes.set(cteFiltered.name, cteFiltered)
            statement.clearWhereClause()

            return cteFiltered.ref()
        }
        else {
            return statement.source as n.TableRef
        }
    }

    /**
     * Create a query to get the results for the current page + 1 extra item. We use the one extra item to determine if there is another page.
     * @param statement 
     * @param decodedCursor 
     * @returns 
     */
    function createPagePlusOneQuery(statement: n.SelectStatement, filteredRef: n.TableRef, constantsRef: n.TableRef, decodedCursor?: any) {
        const subSelect = new n.SelectStatement()
        subSelect.source = filteredRef
        subSelect.fields.set(Symbol(), new n.All())

        const columns = getOrderByColumns(statement)

        // we order by a composite type. Which is a combination of multiple values
        const orderByComposite = new n.CompositeType(...columns)
        const orderDirection = statement.orderByColumns[0]?.mode

        subSelect.orderByColumns = [
            new n.OrderByColumn(orderByComposite, orderDirection)
        ]

        // we request the page + 1 extra. The extra row is used to determine if there is one additional page after the requested one
        subSelect.limit = new n.Operator(constantsRef.column('pageSize'), '+', new n.RawValue(1))

        // if we have a decodedCursor then add it as a where clause
        if (decodedCursor) {
            const compositeValues = columns.map(col => ctx.createPlaceholderForValue(decodedCursor[col.name]))

            const operator = orderDirection === OrderDirection.DESC ? '<' : '>='

            subSelect.addWhereClause(
                new n.Compare(
                    orderByComposite,
                    operator,
                    new n.CompositeType(...compositeValues)
                )
            )
        }

        const selectPagePlusOne = new n.SelectStatement()
        selectPagePlusOne.source = constantsRef
        selectPagePlusOne.fields.set(Symbol(), new n.All())
        selectPagePlusOne.fields.set('rowNumber',
            new n.WindowFunc(new n.AggCall('row_number', []))
        )
        selectPagePlusOne.joins.push(new n.Join(JoinType.CROSS_JOIN_LATERAL, new n.DerivedTable(subSelect, 'a')))

        const ctePagePlusOne = new n.Cte('pagination_page_plus_one', selectPagePlusOne)
        statement.ctes.set(ctePagePlusOne.name, ctePagePlusOne)

        // remove the order by columns as they are now included in a different query
        statement.orderByColumns = []

        return ctePagePlusOne.ref()
    }

    function createNextCursorQuery(statement: n.SelectStatement, ctePagePlusOneRef: n.TableRef) {
        const columns = getOrderByColumns(statement)

        // encode the next cursor by creating a json object containing all order by columns and their values and encoding that json object into a base64 string
        const nextCursor = new n.FuncCall('encode',
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
        )

        const selectNextCursor = new n.SelectStatement()
        selectNextCursor.source = ctePagePlusOneRef
        selectNextCursor.fields.set('nextCursor', nextCursor)
        selectNextCursor.addWhereClause(
            new n.Compare(new n.Column('rowNumber'), '=', new n.Operator(new n.Column('pageSize'), '+', new n.RawValue(1)))
        )

        const cteNextCursor = new n.Cte(
            'pagination_next_cursor',
            selectNextCursor
        )

        statement.ctes.set(cteNextCursor.name, cteNextCursor)

        return cteNextCursor.ref()
    }

    function createFinalPageResultsQuery(ctePagePlusOneRef: n.TableRef) {
        const selectExactPageSize = new n.SelectStatement()
        selectExactPageSize.source = ctePagePlusOneRef
        selectExactPageSize.addWhereClause(new n.Compare(new n.Column('rowNumber'), '<=', new n.Column('pageSize')))
        selectExactPageSize.fields.set(Symbol(), new n.All());

        return selectExactPageSize
    }

    return {
        type: 'paginationItem',
        order: 1,
        [toSqlKey](statement, _ctx) {
            const decodedCursor = options.cursor ? getDecodedCursor(options.cursor) : undefined
            const constantsRef = createConstantsQuery(statement)
            const filteredRef = createFilteredQuery(statement)
            const pagePlusOneRef = createPagePlusOneQuery(statement, filteredRef, constantsRef, decodedCursor)
            const nextCursorRef = createNextCursorQuery(statement, pagePlusOneRef)
            const exactSizeQuery = createFinalPageResultsQuery(pagePlusOneRef)

            const oldSourceName = (statement.source as n.TableRef).name
            const exactSizeDerivedTable = new n.DerivedTable(exactSizeQuery, oldSourceName)

            statement.source = exactSizeDerivedTable

            const selectNextCursor = new n.SelectStatement()
            selectNextCursor.fields.set(Symbol(), nextCursorRef.column('nextCursor'))
            selectNextCursor.source = nextCursorRef

            const selectRowCount = new n.SelectStatement()
            selectRowCount.fields.set(Symbol(), new n.AggCall('count', [new n.All()]))
            selectRowCount.source = filteredRef

            statement.fields.set('pagination',
                new n.FuncCall('jsonb_build_object',
                    new n.RawValue('next'), new n.Subquery(selectNextCursor),
                    new n.RawValue('prev'), ctx.createPlaceholderForValue(options.cursor, 'text'),
                    new n.RawValue('rowCount'), new n.Subquery(selectRowCount),
                )
            )
        }
    }
}

declare module '../../graph/tabular-source/types' {
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
