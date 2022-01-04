import * as n from "./nodes";

export type SqlNode = n.Where | n.AggCall | n.AllFields | n.And | n.Compare | n.Cte | n.DerivedTable | n.Field | n.FuncCall | n.Group | n.Identifier | n.InList | n.Or | n.And | n.OrderBy | n.OrderByColumn | n.Placeholder | n.RawValue | n.SelectStatement | n.Subquery | n.TableRef | n.TableRefWithAlias | n.Where | n.WindowFilter

export function isSqlNode(n: any): n is SqlNode {
    return n.type && n.toSql
}
