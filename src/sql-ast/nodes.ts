import { SqlNode } from './node-types'
import { JoinType, OrderDirection, ValidComparisonSign } from "./types"
import { WhereBuilderResultNode } from '../graph/where-builder'
import { NodeToSqlContext } from './context'

function formatCast(name?: string) {
    return name ? '::' + name : ''
}

export class Operator {
    constructor(public left: FuncCall | AggCall | RawValue | Field | Subquery | Operator, public operator: string, public right: FuncCall | AggCall | RawValue | Field | Subquery | Operator) { }
    public toSql(ctx: NodeToSqlContext) {
        this.left.toSql(ctx)
        ctx.formatter.write(' ' + this.operator + ' ')
        this.right.toSql(ctx)
    }
}

export class WindowFilter {
    constructor(public node: FuncCall | AggCall, public where: Where) { }
    public toSql(ctx: NodeToSqlContext) {
        this.node.toSql(ctx)
        ctx.formatter.write(' FILTER (')
        this.where.toSql(ctx)
        ctx.formatter.write(')')
    }
}

export class Cte {
    constructor(public name: string, public node: SelectStatement) { }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter
            .startIndent()
            .writeLine(`"${this.name}" AS (`)

        this.node.toSql(ctx)

        ctx.formatter
            .writeLine(`)`)
            .endIndent()
    }
}

export class Where {
    constructor(public node: SqlNode) { }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter
            .writeLine('WHERE')
            .break()
            .startIndent()
        this.node.toSql(ctx)
        ctx.formatter.endIndent()
    }
    and(other: SqlNode): And {
        return new And(this, other)
    }
    or(other: SqlNode): Or {
        return new Or(this, other)
    }
}

export class And {
    constructor(public left: SqlNode, public right: SqlNode) { }
    toSql(ctx: NodeToSqlContext) {
        this.left.toSql(ctx)
        ctx.formatter.write(' AND ')
        this.right.toSql(ctx)
    }
    and(other: SqlNode) {
        return new And(this, other)
    }
    or(other: SqlNode) {
        return new Or(this, other)
    }
}

export class Or {
    constructor(public left: SqlNode, public right: SqlNode) { }
    toSql(ctx: NodeToSqlContext) {
        this.left.toSql(ctx)
        ctx.formatter.write(' OR ')
        this.right.toSql(ctx)
    }
    and(other: SqlNode) {
        return new And(this, other)
    }
    or(other: SqlNode) {
        return new Or(this, other)
    }
}

export class InList {
    public nodes: SqlNode[]
    constructor(...nodes: SqlNode[]) {
        this.nodes = nodes
    }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter
            .write('(')
            .join(this.nodes, node => node.toSql(ctx), ', ')
            .write('(')
    }
}

export class Compare {
    constructor(public left: SqlNode, public comparison: ValidComparisonSign, public right: SqlNode) { }
    toSql(ctx: NodeToSqlContext) {
        this.left.toSql(ctx)
        ctx.formatter.write(` ${this.comparison} `)
        this.right.toSql(ctx)
    }
    and(other: SqlNode) {
        return new And(this, other)
    }
    or(other: SqlNode) {
        return new Or(this, other)
    }
}

export class Identifier {
    constructor(public value: string) { }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter.write(this.value)
    }

    static true = new Identifier('TRUE')
    static false = new Identifier('FALSE')
    static null = new Identifier('NULL')
}

export class FuncCall {
    public args: SqlNode[];
    constructor(public name: String, ...args: SqlNode[]) {
        this.args = args
    }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter.write(`${this.name}(`)

        if (this.name === 'jsonb_build_object') {
            ctx.formatter
                .break()
                .startIndent()
                .join(this.args, (arg, index) => {
                    if (index > 0 && index % 2 === 0) {
                        ctx.formatter.break()
                    }
                    arg.toSql(ctx)
                }, ', ')
                .endIndent()
                .break()
        } else {
            const containsFuncCalls = this.args.some(arg => (arg instanceof FuncCall || arg instanceof AggCall))

            if (containsFuncCalls) {
                ctx.formatter.break()

                ctx.formatter.join(this.args, arg => {
                    ctx.formatter.break()
                    ctx.formatter.startIndent()
                    arg.toSql(ctx)
                    ctx.formatter.endIndent()
                }, ', ')
                ctx.formatter.break()
            } else {
                ctx.formatter.join(this.args, arg => arg.toSql(ctx), ', ')
            }

        }
        ctx.formatter.write(`)`)
    }
}

export class AggCall {
    constructor(public name: string, public args: SqlNode[], public orderBy?: OrderBy, public filter?: SqlNode) { }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter.write(`${this.name}(`)

        const containsFuncCalls = this.args.some(arg => (arg instanceof FuncCall || arg instanceof AggCall))

        if (containsFuncCalls) {
            ctx.formatter.break()

            ctx.formatter.join(this.args, arg => {
                ctx.formatter.break()
                ctx.formatter.startIndent()
                arg.toSql(ctx)
                ctx.formatter.endIndent()
            }, ', ')
            ctx.formatter.break()
        } else {
            ctx.formatter.join(this.args, arg => arg.toSql(ctx), ', ')
        }

        if (this.orderBy) {
            ctx.formatter
                .break()
                .startIndent()
            this.orderBy.toSql(ctx)
            ctx.formatter
                .endIndent()
                .break()
        }

        ctx.formatter.write(`)`)

        if (this.filter) {
            ctx.formatter
                .write(' FILTER (')
                .startIndent()
            new Where(this.filter).toSql(ctx)
            ctx.formatter
                .endIndent()
                .break()
                .write(')')
        }
    }
}

export class OrderBy {
    public columns: OrderByColumn[]
    constructor(...columns: OrderByColumn[]) {
        this.columns = columns
    }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter
            .write('ORDER BY ')
            .join(this.columns, col => col.toSql(ctx), ', ')
    }
}

export class RawValue {
    constructor(public value: unknown, public cast?: string) { }
    toSql(ctx: NodeToSqlContext) {
        let formattedValue = this.value;
        switch (typeof this.value) {
            case 'string': {
                formattedValue = `'${this.value.replace(/'/g, "\\'")}'`
                break;
            }
            case 'number': {
                formattedValue = this.value
                break;
            }
        }

        ctx.formatter.write(`${formattedValue}${formatCast(this.cast)}`)
    }
}

export class TableRef {
    constructor(public name: string) { }
    field(fieldName: string, cast?: string) {
        return new Field(fieldName, this.name, cast)
    }
    allFields() {
        return new All(this.name)
    }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter.write(`"${this.name}"`)
    }
}

export class TableRefWithAlias {
    constructor(public ref: TableRef, public alias: string) { }
    toSql(ctx: NodeToSqlContext) {
        this.ref.toSql(ctx)
        ctx.formatter.write(' ' + this.alias)
    }
}

export class All {
    constructor(public table?: string) { }
    toSql(ctx: NodeToSqlContext) {
        const resolvedTable = this.table ?? ctx.table
        if (resolvedTable) {
            new TableRef(resolvedTable).toSql(ctx)
            ctx.formatter.write('.*')
        } else {
            ctx.formatter.write('*')
        }
    }
}

export class Field {
    constructor(public field: string, public table?: string, public cast?: string) { }
    toSql(ctx: NodeToSqlContext) {
        const resolvedTable = this.table ?? ctx.table
        if (typeof resolvedTable === 'string') {
            new TableRef(resolvedTable).toSql(ctx)
            ctx.formatter.write(`."${this.field}"${formatCast(this.cast)}`)
        } else {
            ctx.formatter.write(`"${this.field}"${formatCast(this.cast)}`)
        }
    }
}

export class Group {
    constructor(public node: SqlNode) { }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter.write('(')
        this.node.toSql(ctx)
        ctx.formatter.write(')')
    }
    unwrap() {
        return this.node
    }
}

export class Subquery {
    constructor(public select: SelectStatement) { }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter.write('(')
        ctx.formatter.break()
        this.select.toSql(ctx)
        ctx.formatter.writeLine(')')
    }
}

export class DerivedTable {
    constructor(public select: SelectStatement, public alias: string) { }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter.write('(')
        ctx.formatter.break()
        this.select.toSql(ctx)
        ctx.formatter.writeLine(') ' + this.alias)
    }
}

export class OrderByColumn {
    constructor(public field: Field, public mode?: OrderDirection) { }
    toSql(ctx: NodeToSqlContext) {
        this.field.toSql(ctx)
        ctx.formatter.write(this.mode ? ' ' + this.mode : '')
    }
}

export class Placeholder {
    constructor(public id: number, public cast?: string) { }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter.write('$' + this.id + formatCast(this.cast))
    }
}

export class Join {
    constructor(public type: JoinType, public src: DerivedTable | TableRef | TableRefWithAlias, public compare?: Compare | Identifier | RawValue) { }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter
            .writeLine(`${this.type}`)
            .break()
            .startIndent()
        this.src.toSql(ctx)
        if (this.compare) {
            ctx.formatter.write(` ON `)
            this.compare.toSql(ctx)
        }
        ctx.formatter.endIndent()
    }
}

export type SelectField = Field | Subquery | FuncCall | RawValue | Placeholder | Group

export class SelectStatement {
    public fields = new Map<string, SelectField>()
    public ctes = new Map<string, Cte>()
    public joins: Join[] = [];
    public groupBys: Field[] = [];
    public orderByColumns: OrderByColumn[] = []
    public source?: TableRefWithAlias | TableRef;
    private whereClauseChain?: WhereBuilderResultNode;

    hasWhereClause() {
        return !!this.whereClauseChain
    }

    addWhereClause(node: Exclude<WhereBuilderResultNode, undefined>) {
        this.whereClauseChain = this.whereClauseChain ? new And(this.whereClauseChain, node) : node
    }
    copyOrderBysTo(other: SelectStatement) {
        other.orderByColumns = other.orderByColumns.concat(this.orderByColumns)
    }
    copyGroupBysTo(other: SelectStatement) {
        other.groupBys = other.groupBys.concat(this.groupBys)
    }
    copyWhereClauseTo(other: SelectStatement) {
        if (this.whereClauseChain) {
            other.addWhereClause(this.whereClauseChain)
        }
    }
    copyFieldsTo(other: SelectStatement) {
        for (let [key, node] of this.fields.entries()) {
            other.fields.set(key, node)
        }
    }
    toSql(ctx: NodeToSqlContext) {
        const subCtx: NodeToSqlContext = {
            table: this.source instanceof TableRef ? this.source.name : this.source?.ref.name,
            formatter: ctx.formatter,
        };

        if (this.ctes.size) {
            ctx.formatter.writeLine('WITH')
            ctx.formatter.join(this.ctes.entries(), ([, cte]) => cte.toSql(subCtx), ', ')
        }

        ctx.formatter
            .startIndent()
            .writeLine('SELECT')
            .break()
            .startIndent()

        if (!this.fields.size) {
            ctx.formatter.write('1')
        } else {
            ctx.formatter.join(this.fields.entries(), (field, index) => {
                const [alias, node] = field
                if (index > 0) {
                    ctx.formatter.break()
                }
                node.toSql(ctx)
                ctx.formatter.write(alias ? ` AS "${alias}"` : '')
            }, ',')
        }

        ctx.formatter.endIndent()

        if (this.source) {
            ctx.formatter
                .writeLine('FROM ')
                .break()
                .startIndent()

            this.source.toSql(subCtx)

            ctx.formatter
                .break()
                .endIndent()
        }

        if (this.joins.length > 0 && !this.source) {
            throw new Error('Joins without a source is not allowed')
        }

        ctx.formatter.joinLines(this.joins, join => {
            join.toSql(subCtx)
        })

        if (this.whereClauseChain) {
            new Where(this.whereClauseChain).toSql(subCtx)
        }

        if (this.groupBys.length) {
            ctx.formatter.writeLine('GROUP BY ')
            ctx.formatter.join(this.groupBys, groupByCol => groupByCol.toSql(ctx), ', ')
        }

        if (this.orderByColumns.length) {
            new OrderBy(...this.orderByColumns).toSql(subCtx)
        }

        ctx.formatter.endIndent()
    }
}