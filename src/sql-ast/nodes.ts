import * as nodeTypes from './node-types'
import { JoinType, ValidComparisonSign } from "./types"

export type NodeToSqlContext = {
    table?: string
}

function formatCast(name?: string) {
    return name ? '::' + name : ''
}

export function windowFilter(node: nodeTypes.FuncCall, where: nodeTypes.Where) {
    return {
        type: 'windowFilter' as const,
        toSql(ctx: NodeToSqlContext) {
            return `${node.toSql(ctx)} FILTER (${where.toSql(ctx)})`
        },
    }
}

export function cte(name: string, node: nodeTypes.SelectStatement) {
    return {
        type: 'cte' as const,
        assignTableOwner(newOwner: string) {
            node.assignTableOwner(newOwner)
        },
        toSql(_ctx: NodeToSqlContext) {
            return `WITH "${name}" AS ( ${node.toSql()} )`
        },
    }
}

export function where(node: nodeTypes.SqlNode) {
    return {
        type: 'where' as const,
        toSql(ctx: NodeToSqlContext) {
            return 'WHERE ' + node.toSql(ctx)
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
            return left.toSql(ctx) + ' AND ' + right.toSql(ctx)
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
            return left.toSql(ctx) + ' OR ' + right.toSql(ctx)
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
            return '(' + nodes.map(node => node.toSql(ctx)).join(', ') + ')'
        },
    }
}

export function compare(left: nodeTypes.SqlNode, comparison: ValidComparisonSign, right: nodeTypes.SqlNode) {
    return {
        type: 'comparison' as const,
        toSql(ctx: NodeToSqlContext) {
            return left.toSql(ctx) + ' ' + comparison + ' ' + right.toSql(ctx)
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
        toSql(_ctx: NodeToSqlContext) {
            return value
        }
    }
}

identifier.true = identifier('TRUE')
identifier.false = identifier('FALSE')
identifier.null = identifier('NULL')

export function funcCall(name: string, ...args: Array<nodeTypes.SqlNode>) {
    return {
        type: 'funcCall' as const,
        toSql(ctx: NodeToSqlContext) {
            const argsToStr = args.map(arg => arg.toSql(ctx)).join(', ')
            return `${name}(${argsToStr})`
        }
    }
}

export function rawValue(value: unknown, cast?: string) {
    return {
        type: 'rawValue' as const,
        toSql(_ctx: NodeToSqlContext) {
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

            return `${formattedValue}${formatCast(cast)}`
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
        toSql(_ctx: NodeToSqlContext) {
            return `"${name}"`
        }
    }
}

export function tableRefWithAlias(ref: nodeTypes.TableRef, alias: string) {
    return {
        type: 'tableRefWithAlias' as const,
        toSql(ctx: NodeToSqlContext) {
            return ref.toSql(ctx) + ' ' + alias
        }
    }
}

export function allFields(table?: string) {
    return {
        type: 'tableAllFieldsRef' as const,
        toSql(ctx: NodeToSqlContext) {
            const resolvedTable = table ?? ctx.table
            return resolvedTable ? `"${resolvedTable}".*` : '*'
        }
    }
}

export function field(field: string, table?: string, cast?: string) {
    return {
        type: 'tableFieldRef' as const,
        toSql(ctx: NodeToSqlContext) {
            const resolvedTable = table ?? ctx.table
            return resolvedTable
                ? `"${resolvedTable}".${field}${formatCast(cast)}`
                : `${field}${formatCast(cast)}`
        }
    }
}

export function group(node: nodeTypes.SqlNode) {
    return {
        type: 'group' as const,
        toSql(ctx: NodeToSqlContext) {
            return '(' + node.toSql(ctx) + ')'
        }
    }
}

export function subquery(select: nodeTypes.SelectStatement) {
    return {
        type: 'subquery' as const,
        toSql(_ctx: NodeToSqlContext) {
            return '(' + select.toSql() + ') '
        }
    }
}

export function derivedTable(select: nodeTypes.SelectStatement, alias: string) {
    return {
        type: 'derivedTable' as const,
        toSql(_ctx: NodeToSqlContext) {
            return '(' + select.toSql() + ') ' + alias
        }
    }
}

export function selectStatement() {
    const fieldCollection = createFieldCollection()
    const joinCollection = createJoinCollection()
    const ctes: nodeTypes.Cte[] = [];
    const groupBys: nodeTypes.SqlNode[] = [];
    let mainTableSource: string | undefined;
    const sources: Array<nodeTypes.TableRef | nodeTypes.TableRefWithAlias> = []

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
                return joins.map(join => {
                    return `${join.type} ${join.src.toSql(ctx)} ON ${join.compare.toSql(ctx)}`
                }).join(' ')
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
            toSql(ctx: NodeToSqlContext): string {
                if (!fields.length) {
                    return '1'
                }

                return fields.map(field => {
                    return field.sql.toSql(ctx) + (field.alias ? ` as ${field.alias}` : '')
                }).join(', ')
            },
            get(index: number) {
                return fields[index]
            },
            convertToJsonObject(alias?: string) {
                fields = [{ sql: jsonBuildObject(), alias }]
            },
            convertToJsonAgg(aggField: nodeTypes.TableFieldRef, alias?: string) {
                fields = [{
                    sql: funcCall('coalesce',
                        windowFilter(
                            funcCall('json_agg',
                                jsonBuildObject()
                            ),
                            where(
                                compare(
                                    aggField,
                                    'IS NOT',
                                    identifier.null
                                )
                            )
                        ),
                        rawValue('[]', 'json')
                    ), alias
                }]
            },
            append(otherCollection) {
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
        assignTableOwner(_table: string) { },
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
        source(tableName: string, alias?: string) {
            mainTableSource = alias ?? tableName //anonymous fields will be resolved to the main table source

            const ref = tableRef(tableName)
            sources.push(alias ? tableRefWithAlias(ref, alias) : ref)
        },
        addGroupBy(sql: nodeTypes.SqlNode) {
            groupBys.push(sql)
        },
        toSql() {
            const ctx: NodeToSqlContext = {
                table: mainTableSource
            };

            const parts = []
            if (sources.length) {
                parts.push('FROM ' + sources.map(source => source.toSql(ctx)).join(','))
            }
            if (joinCollection.length) {
                parts.push(joinCollection.toSql(ctx))
            }
            if (whereClauseChain) {
                parts.push(whereClauseChain.toSql(ctx))
            }
            if (groupBys.length) {
                parts.push('GROUP BY ' + groupBys.map(groupBy => groupBy.toSql(ctx)).join(','))
            }

            const cteSql = ctes.map(cte => cte.toSql(ctx)).join('\n')

            return cteSql + `SELECT ${fieldCollection.toSql(ctx)}${parts.length ? ' ' + parts.join(' ') : ''}`
        },

    }
}