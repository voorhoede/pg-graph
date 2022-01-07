const test = require('tape')
const pg = require('pg')
const { graphQuery } = require('../dist')

async function connect() {
    const client = new pg.Client('postgres://postgres@localhost:5433')
    await client.connect()
    return client
}

test('should be able to get the user count', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('user', user => {
        user.agg((agg) => {
            agg.count()
        })
    })

    const row = await client.query(query.toSql()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        userAgg: {
            count: 2,
        },
    })

    await client.end()

    t.end()
})

test('should be able to get the comment count for each blog', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('blog', blog => {
        blog.field('name')
        blog.many('comment', comment => {
            comment.agg(agg => {
                agg.count()
            })
        })
    })

    const row = await client.query(query.toSql()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        blog: [ 
            { 
                name: 'Blog about cats',
                commentAgg: {
                    count: 2,
                }
            },
            { 
                name: 'Blog about computers',
                commentAgg: {
                    count: 3,
                }
            },
        ]
    })

    await client.end()

    t.end()
})