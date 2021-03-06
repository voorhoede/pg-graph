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

    query.source('user', user => {
        user.field('name')

        user
            .throughMany('blog', 'posted_by')
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

test('should be able to get the blog belonging to the comments posted by user "Remco"', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('user', user => {
        user.field('name')

        user
            .throughMany('comment', 'posted_by')
            .one('blog', q => {
                q.field('name')
            })

        user.where('name', '=', 'Remco')
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])

    /*
        Does not really make sense in relation to the data because both comments have the blog
    */
    t.deepEqual(row.data, {
        user: [ 
            {
                name: 'Remco',
                blog: [
                    {
                        name: 'Blog about cats'
                    },
                    {
                        name: 'Blog about cats'
                    }
                ]
            },
        ]
    })

    await client.end()

    t.end()
})

test('should be able to get comments posted on blogs belonging to each user', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('blog', blog => {
        blog.field('name')

        blog
            .throughOne('user', 'posted_by')
            .many('comment', 'posted_by', q => {
                q.field('message')
            })
    })

    const row = await client.query(query.toSql(), query.values()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        blog: [
            {
                name: 'Blog about cats',
                comment: [
                    {
                        message: 'Amazing blog!'
                    },
                    { 
                        message: 'I agree with this blog'
                    } 
                ]
            },
            {
                name: 'Blog about computers',
                comment: [
                    { message: 'Amazing blog!' },
                    { message: 'I agree with this blog' },
                    { message: 'Very nerdy, i agree' }
                ]
            }
        ]
    })

    await client.end()

    t.end()
})