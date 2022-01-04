const test = require('tape')
const { createWhereBuilder } = require('../dist/graph/where-builder')
const { createGraphBuildContext } = require('../dist/graph/context')
const { createNodeToSqlContext } = require('../dist/sql-ast/context')

test('can create separate and conditions', async (t) => {
    const { builder, result } = createWhereBuilder(createGraphBuildContext())

    builder('value1', '=', '1').and('value2', '=', '2')

    const ctx = createNodeToSqlContext()

    result.node.toSql(ctx)

    t.equal(ctx.formatter.toString(), 'value1 = $1::text AND value2 = $2::text')

    t.end()
})

test('can create separate or conditions', async (t) => {
    const { builder, result } = createWhereBuilder(createGraphBuildContext())

    builder('value1', '=', '1').or('value2', '=', '2')

    const ctx = createNodeToSqlContext()

    result.node.toSql(ctx)

    t.equal(ctx.formatter.toString(), 'value1 = $1::text OR value2 = $2::text')

    t.end()
})

test('can create groups', async (t) => {
    const { builder, result } = createWhereBuilder(createGraphBuildContext())

    builder((q) => {
        q((q) => {
            q('value1', '=', '1').or('value2', '=', '2')
                .and((q) => {
                    q('value3', '=', '1').or('value4', '=', '2')
                })
        })
        .and(q => {
            q('value5', '=', '1').or('value6', '=', '2')
        })
    })

    const ctx = createNodeToSqlContext()

    result.node.toSql(ctx)

    t.equal(ctx.formatter.toString(), '(value1 = $1::text OR value2 = $2::text AND (value3 = $1::text OR value4 = $2::text)) AND (value5 = $1::text OR value6 = $2::text)')

    t.end()
})