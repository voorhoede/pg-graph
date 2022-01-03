const test = require('tape')
const pg = require('pg')
const { graphQuery } = require('../dist')

async function connect() {
    const client = new pg.Client('postgres://postgres@localhost:5433')
    await client.connect()
    return client
}

test('should be able to filter on dynamic values', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('user', user => {
        user.field('name')
    
        user.where(q => {
            q('name', '=', 'Remco')
        })
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        user: [
            { name: 'Remco' }
        ]
    })

    await client.end()

    t.end()
})

test('should be able to add dynamic values as a field', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('user', user => {
        user.field('name')
        user.value('role', 'admin')
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        user: [
            { name: 'Remco', role: 'admin' },
            { name: 'Harry', role: 'admin' }
        ]
    })

    await client.end()

    t.end()
})