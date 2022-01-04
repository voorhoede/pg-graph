import { n } from '../sql-ast'
import { GraphToSqlContext } from './context'

export const toSqlKey = Symbol('to sql')

export enum GraphItemTypes {
    TABLE,
    FIELD,
    VALUE,
    WHERE,
    ORDER_BY
}

export type ToSql = {
    [toSqlKey]: (statement: n.SelectStatement, ctx: GraphToSqlContext) => void
}

