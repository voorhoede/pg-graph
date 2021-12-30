import * as n from "./nodes";

export interface TableRef extends ReturnType<typeof n.tableRef> { }
export interface TableAllFieldsRef extends ReturnType<typeof n.allFields> { }
export interface RawValue extends ReturnType<typeof n.rawValue> { }
export interface TableFieldRef extends ReturnType<typeof n.field> { }
export interface Identifier extends ReturnType<typeof n.identifier> { }
export interface SelectStatement extends ReturnType<typeof n.selectStatement> { }
export interface DerivedTable extends ReturnType<typeof n.derivedTable> { }
export interface Group extends ReturnType<typeof n.group> { }
export interface FuncCall extends ReturnType<typeof n.funcCall> { }
export interface Subquery extends ReturnType<typeof n.subquery> { }
export interface TableRefWithAlias extends ReturnType<typeof n.tableRefWithAlias> { }
export interface Compare extends ReturnType<typeof n.compare> { }
export interface And extends ReturnType<typeof n.and> { }
export interface Or extends ReturnType<typeof n.or> { }
export interface Where extends ReturnType<typeof n.where> { }
export interface Cte extends ReturnType<typeof n.cte> { }
export interface WindowFilter extends ReturnType<typeof n.windowFilter> { }
export interface InList extends ReturnType<typeof n.inList> { }

export type SqlNode =
    TableRef |
    TableRefWithAlias |
    TableAllFieldsRef |
    RawValue |
    TableFieldRef |
    Identifier |
    Group |
    FuncCall |
    SelectStatement |
    DerivedTable |
    Subquery |
    Or |
    And |
    Compare |
    Where |
    Cte |
    WindowFilter |
    InList

export function isSqlNode(n: any): n is SqlNode {
    return n.type && n.toSql
}