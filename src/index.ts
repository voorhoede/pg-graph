import { funcCall, rawValue, tableAllFields, tableField, tableRef, selectStatement, JoinType, derivedTable, subquery, tableRefWithAlias } from "./builder";
import type { SelectStatement } from "./builder";

const toSql = Symbol('to sql')

type Fn = (s: TableSource) => void

enum Types {
    TABLE,
    FIELD,
    VALUE,
    WHERE
}

type TableSource = {
    type: Types.TABLE,
    many(tableOrView: string, fn?: Fn): TableSource,
    alias(jsonProp: string): TableSource,
    targetTable(name: string): TableSource,
    where(sql: string): TableSource,
    field(name: string): Field,
    value(jsonProp: string, value: string): Value,
} & ToSql

type Field = {
    type: Types.FIELD,
    alias(jsonProp: string): Field;
} & ToSql

type Value = {
    type: Types.VALUE,
} & ToSql

type Where = {
    type: Types.WHERE,
} & ToSql

type Context = {
    table?: string,
    tableAlias?: string,
    sub(): Context,
    genTableAlias(): string,
}

type ToSql = {
    [toSql]: (statement: SelectStatement, ctx: Context) => void,
}

type Item = TableSource | Field | Value | Where;

function createContext(): Context {
    let alias = 'a'.charCodeAt(0)

    const proto = {
        genTableAlias() {
            return String.fromCharCode(alias++)
        },
        sub() {
            const subContext = Object.create(proto) as Context
            subContext.table = null
            return subContext
        }
    }

    const ctx = Object.create(proto)
    ctx.table = null;
    return ctx;
}

function createField(name: string): Field {
    let jsonProp = name;

    return {
        type: Types.FIELD,
        alias(alias: string) {
            console.log(alias)
            jsonProp = alias;
            return this
        },
        [toSql](statement, ctx) {
            statement.fields.add(tableField(ctx.table, name), jsonProp)
        }
    }
}

function createValue(jsonProp: string, value: string): Value {
    return {
        type: Types.VALUE,
        [toSql](statement) {
            statement.fields.add(rawValue(value, jsonProp))
        }
    }
}

function createWhereClause(sql: string): Where {
    return {
        type: Types.WHERE,
        [toSql](statement) {
            statement.addWhereClause(sql)
        }
    }
}

function createTableSource(fieldName: string, fn?: Fn) {
    const children: Item[] = [];

    let targetTable: string, alias = fieldName;

    const hasSubRelations = () => children.some(child => child.type === Types.TABLE)

    const callToSqlForChilds = (statement: SelectStatement, ctx: Context) => {
        children.forEach(child => child[toSql](statement, ctx))
    }

    const instance: TableSource = {
        type: Types.TABLE,
        many(fieldName, fn): TableSource {
            let item: TableSource = createTableSource(fieldName, fn);
            children.push(item)
            return item
        },
        alias(jsonProp) {
            alias = jsonProp;
            return this
        },
        where(sql: string) {
            children.push(createWhereClause(sql))
            return this
        },
        targetTable(name) {
            targetTable = name;
            return this
        },
        field(name) {
            const field = createField(name)
            children.push(field)
            return field
        },
        value(jsonProp, value) {
            const v = createValue(jsonProp, value);
            children.push(v)
            return v
        },
        [toSql](statement, ctx) {
            const table = targetTable || fieldName;

            if (ctx.table) { // join
                const alias = ctx.genTableAlias()

                const subCtx = ctx.sub()
                subCtx.table = alias;

                const a = tableField(alias, `${ctx.table.toLowerCase()}_id`)
                const b = tableField(ctx.table, 'id')

                if (hasSubRelations()) {

                    const derivedJoinTable = selectStatement()
                    derivedJoinTable.source(tableRef(table), alias)

                    callToSqlForChilds(derivedJoinTable, subCtx)

                    derivedJoinTable.addWhereClause(`${a}=${b}`)

                    const derivedAlias = ctx.genTableAlias();

                    statement.joins.add(JoinType.LEFT_JOIN_NATURAL, derivedTable(derivedJoinTable, derivedAlias), rawValue(1), rawValue(1))

                    statement.fields.add(funcCall('json_agg', tableAllFields(derivedAlias)), fieldName)
                } else {
                    statement.joins.add(JoinType.LEFT_JOIN, tableRefWithAlias(tableRef(table), alias), a, b)

                    const subStatement = selectStatement()

                    callToSqlForChilds(subStatement, subCtx)

                    statement.fields.add(funcCall('json_build_object', ...subStatement.fields.flattened()), fieldName)
                }

                statement.addGroupBy(tableField(ctx.table, 'id'))

            } else { // root select
                const alias = ctx.genTableAlias()

                const subCtx = ctx.sub()
                subCtx.table = alias;

                const subSelect = selectStatement()
                subSelect.source(tableRef(table), alias)

                callToSqlForChilds(subSelect, subCtx)
                subSelect.fields.jsonAgg()

                statement.fields.add(subquery(subSelect), fieldName)
            }
        }
    }

    fn?.(instance)

    return instance
}

export function graphQuery() {
    const sources: TableSource[] = [];

    return {
        source(name: string, fn: Fn) {
            const item = createTableSource(name, fn);
            sources.push(item)
            return item;
        },
        toSql(): string {
            const statement = selectStatement()
            const ctx = createContext()

            const jsonSelect = selectStatement()
            sources[0][toSql](jsonSelect, ctx)

            statement.fields.add(funcCall('json_build_object', ...jsonSelect.fields.flattened()))

            return statement.toSql()
        }
    }
}




const graph = graphQuery()
graph.source('User', user => {
    user.field('email')

    user.many('Tree', tree => {
        //comment.where('creation_date', '>', 'something');

        // tree.many('Order', order => {
        //     order.field('id')
        // })

        /* explicitly use crap */
        //comment.relation('created_by').targetTable('user').alias('createdBy')
        tree.field('name').alias('tree_name') // column
    })
})

// graph.source('User', user => {
//     user.field('email')

//     /* will figure out that there is another table called comment with a blog_id foreign key */
//     user.many('Tree', tree => {
//         //comment.where('creation_date', '>', 'something');

//         tree.many('Order', order => {
//             order.field('id')
//         })

//         /* explicitly use crap */
//         //comment.relation('created_by').targetTable('user').alias('createdBy')
//         tree.field('name').alias('tree_name') // column
//     })

//     user.where("email = 'remco@voorhoede.nl'")

//     // user.where("email = :userEmail", {
//     //     userEmail: 'remco@voorhoede.nl'
//     // })

//     //user.where(condition`email = ${userEmail}`)

// })
console.log(graph.toSql())



/*
    TODO:

    - add table aliases X
    - relation variants
        - one to many
        - one to one
    - ast?
    - test suite

    IDEAS:

    - remove depth
*/