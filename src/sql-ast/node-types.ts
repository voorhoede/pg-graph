import * as n from "./nodes";

export type SqlNode =
    n.Where |
    n.AggCall |
    n.All |
    n.And |
    n.Compare |
    n.Cte |
    n.DerivedTable |
    n.Column |
    n.FuncCall |
    n.Group |
    n.Identifier |
    n.InList |
    n.Or |
    n.And |
    n.OrderBy |
    n.OrderByColumn |
    n.Placeholder |
    n.RawValue |
    n.SelectStatement |
    n.Subquery |
    n.TableRef |
    n.TableRefWithAlias |
    n.Where |
    n.WindowFilter |
    n.Join |
    n.Operator |
    n.WindowFunc |
    n.Case |
    n.CompositeType |
    n.Cast |
    n.Having |
    n.Values

export function isSqlNode(n: any): n is SqlNode {
    return n.type && n.toSql
}
