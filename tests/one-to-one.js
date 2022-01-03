const test = require('tape')
const pg = require('pg')
const { graphQuery } = require('../dist')

async function connect() {
    const client = new pg.Client('postgres://postgres@localhost:5433')
    await client.connect()
    return client
}

test('should be able to get a user for a blog', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('blog', blog => {
        blog.field('name')
        blog.one('user', 'posted_by', user => {
            user.field('name')
        })
    })

    const row = await client.query(query.toSql()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        blog: [ 
            { 
                name: 'Blog about cats',
                user: {
                    name: 'Remco'
                }
            },
            {
                name: 'Blog about computers',
                user: {
                    name: 'Harry'
                }
            }
        ]
    })

    await client.end()

    t.end()
})