import * as nodeTypes from './node-types'
import { JoinType, ValidComparisonSign } from "./types"

function formatCast(name?: string) {
    return name ? '::' + name : ''
}

export function windowFilter(node: nodeTypes.FuncCall, where: nodeTypes.Where) {
    return {
        type: 'windowFilter' as const,
        toSql() {
            return `${node.toSql()} FILTER (${where.toSql()})`
        },
    }
}

export function cte(name: string, node: nodeTypes.SelectStatement) {
    return {
        type: 'cte' as const,
        toSql() {
            return `WITH "${name}" AS ( ${node.toSql()} )`
        },
    }
}

export function where(node: nodeTypes.SqlNode) {
    return {
        type: 'where' as const,
        toSql() {
            return 'WHERE ' + node.toSql()
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
        toSql() {
            return left.toSql() + ' AND ' + right.toSql()
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
        toSql() {
            return left.toSql() + ' OR ' + right.toSql()
        },
        and(other: nodeTypes.SqlNode) {
            return and(this, other)
        },
        or(other: nodeTypes.SqlNode) {
            return or(this, other)
        }
    }
}

export function compare(left: nodeTypes.SqlNode, comparison: ValidComparisonSign, right: nodeTypes.SqlNode) {
    return {
        type: 'comparison' as const,
        toSql() {
            return left.toSql() + ' ' + comparison + ' ' + right.toSql()
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
        value,
        toSql() {
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
        name,
        args,
        toSql() {
            const argsToStr = args.map(arg => arg.toSql()).join(', ')
            return `${this.name}(${argsToStr})`
        }
    }
}

export function rawValue(value: any, cast?: string) {
    return {
        type: 'rawValue' as const,
        value,
        cast,
        toSql() {
            let formattedValue = this.value;
            switch (typeof value) {
                case 'string': {
                    formattedValue = `'${this.value}'` //TODO escape
                    break;
                }
                case 'number': {
                    formattedValue = this.value
                    break;
                }
            }

            return `${formattedValue}${formatCast(this.cast)}`
        }
    }
}

export function tableRef(name: string) {
    return {
        type: 'tableRef' as const,
        name,
        field(field: string) {
            return tableField(this.name, field)
        },
        allFields() {
            return tableAllFields(this.name)
        },
        toSql() {
            return `"${this.name}"`
        }
    }
}

export function tableRefWithAlias(ref: nodeTypes.TableRef, alias: string) {
    return {
        type: 'tableRefWithAlias' as const,
        ref,
        alias,
        toSql() {
            return this.ref.toSql() + ' ' + this.alias
        }
    }
}

export function tableAllFields(table: string) {
    return {
        type: 'tableAllFieldsRef' as const,
        table,
        toSql() {
            return `"${this.table}".*`
        }
    }
}

export function tableField(table: string, field: string, cast?: string) {
    return {
        type: 'tableFieldRef' as const,
        table,
        field,
        cast,
        toSql() {
            return `"${this.table}".${this.field}${formatCast(this.cast)}`
        }
    }
}

export function group(node: nodeTypes.SqlNode) {
    return {
        type: 'group' as const,
        node,
        toSql() {
            return '(' + this.node.toSql() + ')'
        }
    }
}

export function subquery(select: nodeTypes.SelectStatement) {
    return {
        type: 'subquery' as const,
        select,
        toSql() {
            return '(' + this.select.toSql() + ') '
        }
    }
}

export function derivedTable(select: nodeTypes.SelectStatement, alias: string) {
    return {
        type: 'derivedTable' as const,
        select,
        alias,
        toSql() {
            return '(' + this.select.toSql() + ') ' + this.alias
        }
    }
}

export function selectStatement() {
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
            toSql() {
                return joins.map(join => {
                    return `${join.type} ${join.src.toSql()} ON ${join.compare.toSql()}`
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
            toSql(): string {
                if (!fields.length) {
                    return '1'
                }

                return fields.map(field => {
                    return field.sql.toSql() + (field.alias ? ` as ${field.alias}` : '')
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

    const fieldCollection = createFieldCollection()
    const joinCollection = createJoinCollection()
    const ctes: nodeTypes.Cte[] = [];
    const groupBys: nodeTypes.SqlNode[] = [];

    let whereClauseChain: nodeTypes.Where | nodeTypes.And | nodeTypes.Or | null = null;
    let source: nodeTypes.TableRef | nodeTypes.TableRefWithAlias | undefined

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
        source(tableOrView: nodeTypes.TableRef, alias?: string) {
            source = alias ? tableRefWithAlias(tableOrView, alias) : tableOrView
        },
        addGroupBy(sql: nodeTypes.SqlNode) {
            groupBys.push(sql)
        },
        toSql() {
            const parts = []
            if (source) {
                parts.push('FROM ' + source.toSql())
            }
            if (joinCollection.length) {
                parts.push(joinCollection.toSql())
            }
            if (whereClauseChain) {
                parts.push(whereClauseChain.toSql())
            }
            if (groupBys.length) {
                parts.push('GROUP BY ' + groupBys.map(groupBy => groupBy.toSql()).join(','))
            }

            const cteSql = ctes.map(cte => cte.toSql()).join('\n')

            return cteSql + `SELECT ${fieldCollection.toSql()}${parts.length ? ' ' + parts.join(' ') : ''}`
        },

    }
}