const test = require('tape')
const pg = require('pg')
const { graphQuery, installPlugin } = require('../dist')
const { offsetLimitPagination } = require('../dist/plugins/builtin')
const { OrderDirection } = require('../dist/sql-ast')

installPlugin(offsetLimitPagination())

async function connect() {
    const client = new pg.Client('postgres://postgres@localhost:5433')
    await client.connect()
    return client
}

test('first page returns correct pagination', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('visits', visits => {
        visits.pagination({
            page: 1,
            pageSize: 20,
        })

        visits.field('user_id')
        visits.field('last_visit')

        visits.orderBy('id', OrderDirection.ASC);
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])

    t.equal(row.data.visits.length, 20)
    t.equal(row.data.visitsPagination.pageCount, Math.ceil(1000 / 20))
    t.equal(row.data.visitsPagination.page, 1)
    t.equal(row.data.visitsPagination.rowCount, 1000)


    await client.end()

    t.end()
})

test('second page returns correct pagination', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('visits', visits => {
        visits.pagination({
            page: 2,
            pageSize: 20,
        })

        visits.field('id')
        visits.field('user_id')
        visits.field('last_visit')

        visits.orderBy('id', OrderDirection.ASC);
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])

    console.log(row.data.visitsPagination.pageCount)

    t.equal(row.data.visits[0].id, 20)
    t.equal(row.data.visits.length, 20)
    t.equal(row.data.visitsPagination.pageCount, Math.ceil(1000 / 20))
    t.equal(row.data.visitsPagination.page, 2)
    t.equal(row.data.visitsPagination.rowCount, 1000)


    await client.end()

    t.end()
})

test('last page returns correct pagination', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('visits', visits => {
        visits.pagination({
            page: 50,
            pageSize: 20,
        })

        visits.field('user_id')
        visits.field('last_visit')

        visits.orderBy('id', OrderDirection.ASC);
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])

    t.equal(row.data.visits.length, 20)
    t.equal(row.data.visitsPagination.pageCount, Math.ceil(1000 / 20))
    t.equal(row.data.visitsPagination.page, 50)
    t.equal(row.data.visitsPagination.rowCount, 1000)

    await client.end()

    t.end()
})