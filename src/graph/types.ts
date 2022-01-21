import { n } from '../sql-ast'
import { GraphToSqlContext } from './context'

export const toSqlKey = Symbol('to sql')

export enum GraphItemTypes {
    TABLE = 'table',
    FIELD = 'field',
    VALUE = 'value',
    WHERE = 'where',
    ORDER_BY = 'orderBy',
    LIMIT = 'limit',
    AGG = 'agg',
}

export enum RelationType {
    Many,
    One,
}

export type ToSql = {
    [toSqlKey]: (statement: n.SelectStatement, ctx: GraphToSqlContext) => void
}

