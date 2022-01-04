import { SqlNode } from './node-types'
import { JoinType, OrderDirection, ValidComparisonSign } from "./types"
import { WhereBuilderResultNode } from '../graph/where-builder'
import { NodeToSqlContext } from './context'

function formatCast(name?: string) {
    return name ? '::' + name : ''
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
        if (this.name === 'json_build_object') {
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
            ctx.formatter.join(this.args, arg => arg.toSql(ctx), ', ')
        }
        ctx.formatter.write(`)`)
    }
}

export class AggCall {
    constructor(public name: string, public args: SqlNode[], public orderBy?: OrderBy) { }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter
            .write(`${this.name}(`)
            .join(this.args, arg => arg.toSql(ctx), ', ')
            .write(`${this.orderBy ? ' ' + this.orderBy.toSql(ctx) : ''}`)
            .write(`)`)
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
        return new AllFields(this.name)
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

export class AllFields {
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
            ctx.formatter.write(`.${this.field}${formatCast(this.cast)}`)
        } else {
            ctx.formatter.write(`${this.field}${formatCast(this.cast)}`)
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
    constructor(public type: JoinType, public src: DerivedTable | TableRef | TableRefWithAlias, public compare: Compare | Identifier | RawValue) { }
    toSql(ctx: NodeToSqlContext) {
        ctx.formatter
            .writeLine(`${this.type}`)
            .break()
            .startIndent()
        this.src.toSql(ctx)
        ctx.formatter.write(` ON `)
        this.compare.toSql(ctx)
        ctx.formatter.endIndent()
    }
}

type SelectField = Field | Subquery | FuncCall | RawValue | Placeholder

function createFieldCollection() {
    let fields: Array<{ sql: SelectField, alias?: string }> = []

    function jsonBuildObject() {
        if (!fields.length) {
            return new RawValue('{}', 'json')
        } else {
            return new FuncCall('json_build_object', ...flattened())
        }
    }

    function flattened() {
        const args: Array<SqlNode> = [];
        fields.forEach(field => {
            args.push(new RawValue(field.alias))
            args.push(field.sql)
        })

        return args
    }

    return {
        add(sql: SelectField, alias?: string) {
            fields.push({ sql, alias })
        },
        toSql(ctx: NodeToSqlContext) {
            if (!fields.length) {
                ctx.formatter.write('1')
                return
            }

            ctx.formatter.join(fields, (field, index) => {
                if (index > 0) {
                    ctx.formatter.break()
                }
                field.sql.toSql(ctx)
                ctx.formatter.write(field.alias ? ` as ${field.alias}` : '')
            }, ',')
        },
        convertToJsonObject(alias?: string) {
            if (fields.length) {
                fields = [{ sql: jsonBuildObject(), alias }]
            }
        },
        convertToJsonAgg(alias?: string, nullField?: Field, orderBy?: OrderBy) {
            if (!fields.length) {
                return
            }

            const call = new AggCall('json_agg', [
                jsonBuildObject(),
            ], orderBy)

            if (nullField) {
                fields = [{
                    sql: new FuncCall('coalesce',
                        new WindowFilter(
                            call,
                            new Where(
                                new Compare(
                                    nullField,
                                    'IS NOT',
                                    Identifier.null
                                )
                            )
                        ),
                        new RawValue('[]', 'json')
                    ),
                    alias
                }]
            } else {
                fields = [{
                    sql: new FuncCall('coalesce',
                        new FuncCall('json_agg',
                            jsonBuildObject()
                        ),
                        new RawValue('[]', 'json')
                    ),
                    alias
                }]
            }
        },
        get length() {
            return fields.length
        },
        [Symbol.iterator]() {
            return fields[Symbol.iterator]()
        }
    }
}

export class SelectStatement {
    private fields = createFieldCollection()
    private joins: Join[] = [];
    private ctes: Cte[] = [];
    private groupBys: Field[] = [];
    private orderByColumns: OrderByColumn[] = []
    private sources: Array<TableRef | TableRefWithAlias> = []
    private mainTableSource?: string;
    private whereClauseChain: WhereBuilderResultNode | null = null;

    constructor() { }

    addCte(node: Cte) {
        this.ctes.push(node)
    }
    addWhereClause(node: Exclude<WhereBuilderResultNode, null>) {
        this.whereClauseChain = this.whereClauseChain ? new And(this.whereClauseChain, node) : node
    }
    convertFieldsToJsonAgg(alias?: string, nullField?: Field) {
        this.fields.convertToJsonAgg(alias, nullField, this.orderByColumns.length ? new OrderBy(...this.orderByColumns) : undefined)
        this.orderByColumns.length = 0
    }
    convertFieldsToJsonObject(alias?: string) {
        this.fields.convertToJsonObject(alias)
    }
    source(tableName: string, alias?: string) {
        this.mainTableSource = alias ?? tableName //anonymous fields will be resolved to the main table source

        const ref = new TableRef(tableName)
        this.sources.push(alias ? new TableRefWithAlias(ref, alias) : ref)
    }
    addJoin(sql: Join) {
        this.joins.push(sql)
    }
    addGroupBy(sql: Field) {
        this.groupBys.push(sql)
    }
    addOrderBy(sql: OrderByColumn) {
        this.orderByColumns.push(sql)
    }
    addField(field: SelectField, alias?: string) {
        this.fields.add(field, alias)
    }
    copyOrderBys(other: SelectStatement) {
        this.orderByColumns.forEach(orderBy => {
            other.addOrderBy(orderBy)
        })
    }
    copyGroupBys(other: SelectStatement) {
        this.groupBys.forEach(groupBy => {
            other.addGroupBy(groupBy)
        })
    }
    copyWhereClause(other: SelectStatement) {
        if (this.whereClauseChain) {
            other.addWhereClause(this.whereClauseChain)
        }
    }
    copyFields(other: SelectStatement) {
        for (let { sql, alias } of this.fields) {
            other.addField(sql, alias)
        }
    }
    toSql(ctx: NodeToSqlContext) {
        const subCtx: NodeToSqlContext = {
            table: this.mainTableSource,
            formatter: ctx.formatter,
        };

        if (this.ctes.length) {
            ctx.formatter.writeLine('WITH')
            this.ctes.forEach(cte => cte.toSql(subCtx))
        }

        ctx.formatter
            .startIndent()
            .writeLine('SELECT')
            .break()
            .startIndent()

        this.fields.toSql(subCtx)

        ctx.formatter.endIndent()

        if (this.sources.length) {
            ctx.formatter
                .writeLine('FROM ')
                .break()
                .startIndent()
                .join(this.sources, source => {
                    source.toSql(subCtx)
                }, ', ')
                .break()
                .endIndent()
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