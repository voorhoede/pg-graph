export type TableRef = ReturnType<typeof tableRef>
export type TableAllFieldsRef = ReturnType<typeof tableAllFields>
export type RawValue = ReturnType<typeof rawValue>
export type TableFieldRef = ReturnType<typeof tableField>
export type Identifier = ReturnType<typeof identifier>
export interface SelectStatement extends ReturnType<typeof selectStatement> { }
export interface DerivedTable extends ReturnType<typeof derivedTable> { }
export interface Group extends ReturnType<typeof group> { }
export interface FuncCall extends ReturnType<typeof funcCall> { }
export interface Subquery extends ReturnType<typeof subquery> { }
export interface TableRefWithAlias extends ReturnType<typeof tableRefWithAlias> { }
export interface Compare extends ReturnType<typeof compare> { }
export interface And extends ReturnType<typeof and> { }
export interface Or extends ReturnType<typeof or> { }

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
    Compare;

export function and(left: SqlNode, right: SqlNode) {
    return {
        type: 'and' as const,
        toSql() {
            return '(' + left.toSql() + ' AND ' + right.toSql() + ')'
        }
    }
}

export function or(left: SqlNode, right: SqlNode) {
    return {
        type: 'or' as const,
        toSql() {
            return '(' + left.toSql() + ' OR ' + right.toSql() + ')'
        }
    }
}

export type ValidComparisonSigns = '=' | '!=' | '>' | '<' | '>=' | '<='

export function compare(left: SqlNode, comparison: ValidComparisonSigns, right: SqlNode) {
    return {
        type: 'comparison' as const,
        toSql() {
            return left.toSql() + ' ' + comparison + ' ' + right.toSql()
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

identifier.true = identifier('true')
identifier.false = identifier('true')

export function funcCall(name: string, ...args: Array<SqlNode>) {
    return {
        type: 'funcCall' as const,
        name,
        args,
        toSql() {
            const argsToStr = args.map(arg => arg.toSql()).join(', ')
            return `${name}(${argsToStr})`
        }
    }
}

export function rawValue(value: any, cast?: string) {
    return {
        type: 'rawValue' as const,
        value,
        cast,
        toSql() {
            let formattedValue = value;
            switch (typeof value) {
                case 'string': {
                    formattedValue = `'${value}'` //TODO escape
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
        name,
        field(field: string,) {
            return tableField(name, field)
        },
        allFields() {
            return tableAllFields(name)
        },
        toSql() {
            return `"${name}"`
        }
    }
}

export function tableRefWithAlias(ref: TableRef, alias: string) {
    return {
        type: 'tableRefWithAlias' as const,
        ref,
        toSql() {
            return ref.toSql() + ' ' + alias
        }
    }
}

export function tableAllFields(table: string) {
    return {
        type: 'tableAllFieldsRef' as const,
        table,
        toSql() {
            return `"${table}".*`
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
            return `"${table}".${field}${formatCast(cast)}`
        }
    }
}

export function group(node: SqlNode) {
    return {
        type: 'group' as const,
        toSql() {
            return '(' + node.toSql() + ')'
        }
    }
}

export function subquery(select: SelectStatement) {
    return {
        type: 'subquery' as const,
        toSql() {
            return '(' + select.toSql() + ') '
        }
    }
}

export function derivedTable(select: SelectStatement, alias: string) {
    return {
        type: 'derivedTable' as const,
        toSql() {
            return '(' + select.toSql() + ') ' + alias
        }
    }
}


export enum JoinType {
    INNER_JOIN = 'INNER_JOIN',
    LEFT_JOIN = 'LEFT JOIN',
    LEFT_OUTER_JOIN = 'LEFT OUTER JOIN',
    RIGHT_JOIN = 'RIGHT_JOIN',
    RIGHT_OUTER_JOIN = 'RIGHT OUTER JOIN',
    FULL_OUTER = 'FULL OUTER',
    CROSS_JOIN = 'CROSS JOIN',
    LEFT_JOIN_NATURAL = 'LEFT JOIN NATURAL',
}

export function selectStatement() {
    type Join = {
        type: JoinType
        src: DerivedTable | TableRef | TableRefWithAlias
        compare: Compare | Identifier | RawValue
    }

    function createJoinCollection() {
        let joins: Join[] = []
        return {
            get length() {
                return joins.length
            },
            add(type: JoinType, src: DerivedTable | TableRef | TableRefWithAlias, compare: Compare | Identifier | RawValue) {
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
        let fields: Array<{ sql: SqlNode, alias?: string }> = []
        return {
            get length() {
                return fields.length
            },
            add(sql: SqlNode, alias?: string) {
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
            json(alias?: string) {
                fields = [{ sql: funcCall('json_build_object', ...this.flattened()), alias }]
            },
            jsonAgg(alias?: string) {
                fields = [{ sql: funcCall('json_agg', funcCall('json_build_object', ...this.flattened())), alias }]
            },
            append(otherCollection) {
                for (let item of otherCollection) {
                    this.add(item.sql, item.alias)
                }
            },
            flattened() {
                const args: Array<SqlNode> = [];
                fields.forEach(field => {
                    args.push(rawValue(field.alias))
                    args.push(field.sql)
                })

                return args
            },
            [Symbol.iterator]() {
                return fields[Symbol.iterator]()
            }
        }
    }

    const fieldCollection = createFieldCollection()
    const joinCollection = createJoinCollection()
    const groupBys: SqlNode[] = [];

    let whereClause: SqlNode;
    let source: TableRef | TableRefWithAlias | undefined

    return {
        type: 'selectStatement' as const,
        get fields() {
            return fieldCollection
        },
        get joins() {
            return joinCollection
        },
        source(tableOrView: TableRef, alias?: string) {
            source = alias ? tableRefWithAlias(tableOrView, alias) : tableOrView
        },
        addGroupBy(sql: SqlNode) {
            groupBys.push(sql)
        },
        addWhereClause(sql: SqlNode) {
            whereClause = sql
        },
        toSql() {
            const parts = []
            if (source) {
                parts.push('FROM ' + source.toSql())
            }
            if (joinCollection.length) {
                parts.push(joinCollection.toSql())
            }
            if (whereClause) {
                parts.push('WHERE ' + whereClause.toSql())
            }
            if (groupBys.length) {
                parts.push('GROUP BY ' + groupBys.map(groupBy => groupBy.toSql()).join(','))
            }

            return `SELECT ${fieldCollection.toSql()}${parts.length ? ' ' + parts.join(' ') : ''}`
        },

    }
}


function formatAlias(name?: string) {
    return name ? ' as ' + name : ''
}

function formatCast(name?: string) {
    return name ? '::' + name : ''
}