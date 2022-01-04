const test = require('tape')
const pg = require('pg')
const { graphQuery } = require('../dist')

async function connect() {
    const client = new pg.Client('postgres://postgres@localhost:5433')
    await client.connect()
    return client
}

test('should be able to get all comments belonging to the blogs of user "Remco"', async (t) => {
    const client = await connect()

    const query = graphQuery()

    // query.source('comment', comment => {
    //     comment.alias('comments')

    //     comment
    //         .through('')
    //         .one('user', '')
    // })

    query.source('user', user => {
        user.field('name')

        user
            .through('blog')
            .many('comment', q => {
                q.field('message')
            })

        user.where('name', '=', 'Remco')
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        user: [ 
            {
                name: 'Remco',
                comment: [
                    { message: 'Amazing blog!' },
                    { message: 'I agree with this blog' }
                ]
            },
        ]
    })

    await client.end()

    t.end()
})
