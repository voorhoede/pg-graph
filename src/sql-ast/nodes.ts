import * as nodeTypes from './node-types'
import { JoinType, OrderDirection, ValidComparisonSign } from "./types"
import { createFormatter, Formatter } from './formatting'

export type NodeToSqlContext = {
    table?: string,
    formatter: Formatter,
}

export function createNodeToSqlContext(formatter = createFormatter()) {
    return {
        table: undefined,
        formatter
    }
}

function formatCast(name?: string) {
    return name ? '::' + name : ''
}

export function windowFilter(node: nodeTypes.FuncCall | nodeTypes.AggCall, where: nodeTypes.Where) {
    return {
        type: 'windowFilter' as const,
        toSql(ctx: NodeToSqlContext) {
            node.toSql(ctx)
            ctx.formatter.write(' FILTER (')
            where.toSql(ctx)
            ctx.formatter.write(')')
        },
    }
}

export function cte(name: string, node: nodeTypes.SelectStatement) {
    return {
        type: 'cte' as const,
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter
                .startIndent()
                .writeLine(`"${name}" AS (`)

            node.toSql(ctx)

            ctx.formatter
                .writeLine(`)`)
                .endIndent()
        },
    }
}

export function where(node: nodeTypes.SqlNode) {
    return {
        type: 'where' as const,
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter
                .writeLine('WHERE')
                .break()
                .startIndent()
            node.toSql(ctx)
            ctx.formatter.endIndent()
        },
        and(other: nodeTypes.SqlNode) {
            return and(this, other)
        },
        or(other: nodeTypes.SqlNode) {
            return or(this, other)
        }
    }
}

export function and(left: nodeTypes.SqlNode, right: nodeTypes.SqlNode) {
    return {
        type: 'and' as const,
        toSql(ctx: NodeToSqlContext) {
            left.toSql(ctx)
            ctx.formatter.write(' AND ')
            right.toSql(ctx)
        },
        and(other: nodeTypes.SqlNode) {
            return and(this, other)
        },
        or(other: nodeTypes.SqlNode) {
            return or(this, other)
        }
    }
}

export function or(left: nodeTypes.SqlNode, right: nodeTypes.SqlNode) {
    return {
        type: 'or' as const,
        toSql(ctx: NodeToSqlContext) {
            left.toSql(ctx)
            ctx.formatter.write(' OR ')
            right.toSql(ctx)
        },
        and(other: nodeTypes.SqlNode) {
            return and(this, other)
        },
        or(other: nodeTypes.SqlNode) {
            return or(this, other)
        }
    }
}

export function inList(...nodes: nodeTypes.SqlNode[]) {
    return {
        type: 'inList' as const,
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter
                .write('(')
                .join(nodes, node => node.toSql(ctx), ', ')
                .write('(')
        },
    }
}

export function compare(left: nodeTypes.SqlNode, comparison: ValidComparisonSign, right: nodeTypes.SqlNode) {
    return {
        type: 'comparison' as const,
        toSql(ctx: NodeToSqlContext) {
            left.toSql(ctx)
            ctx.formatter.write(` ${comparison} `)
            right.toSql(ctx)
        },
        and(other: nodeTypes.SqlNode) {
            return and(this, other)
        },
        or(other: nodeTypes.SqlNode) {
            return or(this, other)
        }
    }
}

export function identifier(value: string) {
    return {
        type: 'identifier' as const,
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter.write(value)
        }
    }
}

identifier.true = identifier('TRUE')
identifier.false = identifier('FALSE')
identifier.null = identifier('NULL')

export function funcCall(name: string, ...args: nodeTypes.SqlNode[]) {
    return {
        type: 'funcCall' as const,
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter.write(`${name}(`)
            if (name === 'json_build_object') {
                ctx.formatter
                    .break()
                    .startIndent()
                    .join(args, (arg, index) => {
                        if (index > 0 && index % 2 === 0) {
                            ctx.formatter.break()
                        }
                        arg.toSql(ctx)
                    }, ', ')
                    .endIndent()
                    .break()
            } else {
                ctx.formatter.join(args, arg => arg.toSql(ctx), ', ')
            }
            ctx.formatter.write(`)`)
        }
    }
}

export function aggCall(name: string, args: nodeTypes.SqlNode[], orderBy?: nodeTypes.OrderBy) {
    return {
        type: 'aggCall' as const,
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter
                .write(`${name}(`)
                .join(args, arg => arg.toSql(ctx), ', ')
                .write(`${orderBy ? ' ' + orderBy.toSql(ctx) : ''}`)
                .write(`)`)
        }
    }
}

export function orderBy(...columns: nodeTypes.OrderByColumn[]) {
    return {
        type: 'orderBy' as const,
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter
                .write('ORDER BY ')
                .join(columns, col => col.toSql(ctx), ', ')
        }
    }
}

export function rawValue(value: unknown, cast?: string) {
    return {
        type: 'rawValue' as const,
        toSql(ctx: NodeToSqlContext) {
            let formattedValue = value;
            switch (typeof value) {
                case 'string': {
                    formattedValue = `'${value.replace(/'/g, "\\'")}'`
                    break;
                }
                case 'number': {
                    formattedValue = value
                    break;
                }
            }

            ctx.formatter.write(`${formattedValue}${formatCast(cast)}`)
        }
    }
}

export function tableRef(name: string) {
    return {
        type: 'tableRef' as const,
        field(fieldName: string, cast?: string) {
            return field(fieldName, name, cast)
        },
        allFields() {
            return allFields(name)
        },
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter.write(`"${name}"`)
        }
    }
}

export function tableRefWithAlias(ref: nodeTypes.TableRef, alias: string) {
    return {
        type: 'tableRefWithAlias' as const,
        toSql(ctx: NodeToSqlContext) {
            ref.toSql(ctx)
            ctx.formatter.write(' ' + alias)
        }
    }
}

export function allFields(table?: string) {
    return {
        type: 'tableAllFieldsRef' as const,
        toSql(ctx: NodeToSqlContext) {
            const resolvedTable = table ?? ctx.table
            ctx.formatter.write(resolvedTable ? `"${resolvedTable}".*` : '*')
        }
    }
}

export function field(field: string, table?: string, cast?: string) {
    return {
        type: 'tableFieldRef' as const,
        toSql(ctx: NodeToSqlContext) {
            const resolvedTable = table ?? ctx.table
            ctx.formatter.write(
                resolvedTable
                    ? `"${resolvedTable}".${field}${formatCast(cast)}`
                    : `${field}${formatCast(cast)}`
            )
        }
    }
}

export function group(node: nodeTypes.SqlNode) {
    return {
        type: 'group' as const,
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter.write('(')
            node.toSql(ctx)
            ctx.formatter.write(')')
        },
        unwrap() {
            return node
        }
    }
}

export function subquery(select: nodeTypes.SelectStatement) {
    return {
        type: 'subquery' as const,
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter.write('(')
            ctx.formatter.break()
            select.toSql(ctx)
            ctx.formatter.writeLine(')')
        }
    }
}

export function derivedTable(select: nodeTypes.SelectStatement, alias: string) {
    return {
        type: 'derivedTable' as const,
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter.write('(')
            ctx.formatter.break()
            select.toSql(ctx)
            ctx.formatter.writeLine(') ' + alias)
        }
    }
}

export function orderByColumn(field: nodeTypes.TableFieldRef, mode?: OrderDirection) {
    return {
        type: 'orderByColumn' as const,
        toSql(ctx: NodeToSqlContext) {
            field.toSql(ctx)
            ctx.formatter.write(mode ? ' ' + mode : '')
        }
    }
}

export function placeholder(id: number, cast?: string) {
    return {
        type: 'placeholder' as const,
        toSql(ctx: NodeToSqlContext) {
            ctx.formatter.write('$' + id + formatCast(cast))
        }
    }
}

export function selectStatement() {
    const fieldCollection = createFieldCollection()
    const joinCollection = createJoinCollection()
    const ctes: nodeTypes.Cte[] = [];
    const groupBys: nodeTypes.TableFieldRef[] = [];
    const orderBys: nodeTypes.OrderByColumn[] = []
    const sources: Array<nodeTypes.TableRef | nodeTypes.TableRefWithAlias> = []

    let mainTableSource: string | undefined;
    let whereClauseChain: nodeTypes.Where | nodeTypes.And | nodeTypes.Or | null = null;

    type Join = {
        type: JoinType
        src: nodeTypes.DerivedTable | nodeTypes.TableRef | nodeTypes.TableRefWithAlias
        compare: nodeTypes.Compare | nodeTypes.Identifier | nodeTypes.RawValue
    }

    function createJoinCollection() {
        let joins: Join[] = []
        return {
            get length() {
                return joins.length
            },
            add(type: JoinType, src: nodeTypes.DerivedTable | nodeTypes.TableRef | nodeTypes.TableRefWithAlias, compare: nodeTypes.Compare | nodeTypes.Identifier | nodeTypes.RawValue) {
                joins.push({ type, src, compare })
            },
            toSql(ctx: NodeToSqlContext) {
                ctx.formatter.join(joins, join => {
                    ctx.formatter.write(`${join.type} `)
                    join.src.toSql(ctx)
                    ctx.formatter.write(` ON `)
                    join.compare.toSql(ctx)
                }, undefined)
            },
            [Symbol.iterator]() {
                return joins[Symbol.iterator]()
            }
        }
    }

    function createFieldCollection() {
        let fields: Array<{ sql: nodeTypes.SqlNode, alias?: string }> = []

        function jsonBuildObject() {
            if (!fields.length) {
                return rawValue('{}', 'json')
            } else {
                return funcCall('json_build_object', ...flattened())
            }
        }

        function flattened() {
            const args: Array<nodeTypes.SqlNode> = [];
            fields.forEach(field => {
                args.push(rawValue(field.alias))
                args.push(field.sql)
            })

            return args
        }

        return {
            get length() {
                return fields.length
            },
            add(sql: nodeTypes.SqlNode, alias?: string) {
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
                fields = [{ sql: jsonBuildObject(), alias }]
            },
            convertToJsonAgg(alias?: string, nullField?: nodeTypes.TableFieldRef, orderBy?: nodeTypes.OrderBy) {
                const call = aggCall('json_agg', [
                    jsonBuildObject(),
                ], orderBy)

                if (nullField) {
                    fields = [{
                        sql: funcCall('coalesce',
                            windowFilter(
                                call,
                                where(
                                    compare(
                                        nullField,
                                        'IS NOT',
                                        identifier.null
                                    )
                                )
                            ),
                            rawValue('[]', 'json')
                        ), alias
                    }]
                } else {
                    fields = [{
                        sql: funcCall('json_agg',
                            jsonBuildObject()
                        ),
                        alias
                    }]
                }
            },
            append(otherCollection: any) {
                for (let item of otherCollection) {
                    this.add(item.sql, item.alias)
                }
            },
            [Symbol.iterator]() {
                return fields[Symbol.iterator]()
            }
        }
    }

    return {
        type: 'selectStatement' as const,
        get fields() {
            return fieldCollection
        },
        get joins() {
            return joinCollection
        },
        addCte(node: nodeTypes.Cte) {
            ctes.push(node)
        },
        addWhereClause(node: nodeTypes.SqlNode) {
            whereClauseChain = whereClauseChain ? whereClauseChain.and(node) : where(node)
        },
        convertFieldsToJsonAgg(alias?: string, nullField?: nodeTypes.TableFieldRef) {
            fieldCollection.convertToJsonAgg(alias, nullField, orderBys.length ? orderBy(...orderBys) : undefined)
            orderBys.length = 0
        },
        convertFieldsToJsonObject(alias?: string) {
            fieldCollection.convertToJsonObject(alias)
        },
        source(tableName: string, alias?: string) {
            mainTableSource = alias ?? tableName //anonymous fields will be resolved to the main table source

            const ref = tableRef(tableName)
            sources.push(alias ? tableRefWithAlias(ref, alias) : ref)
        },
        addGroupBy(sql: nodeTypes.TableFieldRef) {
            groupBys.push(sql)
        },
        addOrderBy(sql: nodeTypes.OrderByColumn) {
            orderBys.push(sql)
        },
        toSql(ctx: NodeToSqlContext) {
            const subCtx: NodeToSqlContext = {
                table: mainTableSource,
                formatter: ctx.formatter,
            };

            if (ctes.length) {
                ctx.formatter.writeLine('WITH')
                ctes.forEach(cte => cte.toSql(subCtx))
            }

            ctx.formatter
                .startIndent()
                .writeLine('SELECT')
                .break()
                .startIndent()

            fieldCollection.toSql(subCtx)

            ctx.formatter.endIndent()

            if (sources.length) {
                ctx.formatter
                    .writeLine('FROM ')
                    .break()
                    .startIndent()
                    .join(sources, source => {
                        source.toSql(subCtx)
                    }, ', ')
                    .break()
                    .endIndent()
            }

            joinCollection.toSql(subCtx)

            if (whereClauseChain) {
                whereClauseChain.toSql(subCtx)
            }

            if (groupBys.length) {
                ctx.formatter.writeLine('GROUP BY ')
                ctx.formatter.join(groupBys, groupByCol => groupByCol.toSql(ctx), ', ')
            }

            if (orderBys.length) {
                orderBy(...orderBys).toSql(subCtx)
            }

            ctx.formatter.endIndent()
        },

    }
}