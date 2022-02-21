const test = require('tape')
const pg = require('pg')
const { graphQuery, installPlugin } = require('../dist')
const { keysetPagination } = require('../dist/plugins/builtin')
const { OrderDirection } = require('../dist/sql-ast')

installPlugin(keysetPagination())

async function connect() {
    const client = new pg.Client('postgres://postgres@localhost:5433')
    await client.connect()
    return client
}

test('first page returns correct pagination', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('visits', visits => {
        visits.keysetPagination({
            pageSize: 20,
        })

        visits.field('user_id')
        visits.field('last_visit')

        visits.orderBy('id', OrderDirection.ASC);
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])
    let parsedCursor;

    t.doesNotThrow(() => {
        const cursor = Buffer.from(row.data.visitsPagination.next, 'base64').toString('utf8');
        parsedCursor = JSON.parse(cursor)
    })

    // get the first id on the next page
    const { id: nextId } = await client.query('SELECT id FROM visits ORDER BY id ASC OFFSET 20 LIMIT 1').then(result => result.rows[0])

    t.equal(parsedCursor.id, nextId)
    t.equal(row.data.visits.length, 20)
    t.equal(row.data.visitsPagination.prev, null)
    t.equal(row.data.visitsPagination.rowCount, 1000)

    await client.end()

    t.end()
})

test('second page returns correct pagination', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('visits', visits => {
        visits.keysetPagination({
            pageSize: 20,
            cursor: Buffer.from(JSON.stringify({ id: 21 })).toString('base64')
        })

        visits.field('id')
        visits.field('user_id')
        visits.field('last_visit')

        visits.orderBy('id', OrderDirection.ASC);
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])

    t.equal(row.data.visits[0].id, 21)
    t.equal(row.data.visits.length, 20)
    t.equal(row.data.visitsPagination.rowCount, 1000)
    const cursor = JSON.parse(Buffer.from(row.data.visitsPagination.next, 'base64').toString('utf8'))
    t.equal(cursor.id, 41)

    await client.end()

    t.end()
})

test('last page returns correct pagination', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('visits', visits => {
        visits.keysetPagination({
            pageSize: 20,
            cursor: Buffer.from(JSON.stringify({ id: 980 })).toString('base64')
        })

        visits.field('id')
        visits.field('user_id')
        visits.field('last_visit')

        visits.orderBy('id', OrderDirection.ASC);
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])

    t.equal(row.data.visits[0].id, 980)
    t.equal(row.data.visits.length, 20)
    t.equal(row.data.visitsPagination.rowCount, 1000)
    t.equal(row.data.visitsPagination.next, null)

    await client.end()

    t.end()
})