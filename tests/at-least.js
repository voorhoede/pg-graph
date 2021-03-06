const test = require('tape')
const pg = require('pg')
const { graphQuery } = require('../dist')

async function connect() {
    const client = new pg.Client('postgres://postgres@localhost:5433')
    await client.connect()
    return client
}

test('returns at least 2 comments for user "Remco"', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('comment', comment => {
        comment.field('message')

        comment.atLeast(2)

        comment.one('user', 'posted_by', user => {
            user.atLeast(1)
            user.where('name', '=', 'Remco')
        })
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])

    t.deepEqual(row.data, 
        { comment: [ { message: 'Amazing blog!' }, { message: 'I agree with this blog' } ] }    
    )

    await client.end()

    t.end()
})

test('does not return anything when we request at least 3 comments for user "Remco"', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('comment', comment => {
        comment.field('message')

        comment.atLeast(3)

        comment.one('user', 'posted_by', user => {
            user.atLeast(1)
            user.where('name', '=', 'Remco')
        })
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0].data)

    t.deepEqual(row.comment, [])

    await client.end()

    t.end()
})