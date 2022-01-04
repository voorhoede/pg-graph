const test = require('tape')
const pg = require('pg')
const { graphQuery } = require('../dist')

async function connect() {
    const client = new pg.Client('postgres://postgres@localhost:5433')
    await client.connect()
    return client
}

test('should be able to get all user names', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('user', user => {
        user.field('name')
    })

    const row = await client.query(query.toSql()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        user: [ 
            { name: 'Remco' },
            { name: 'Harry' }
        ]
    })

    await client.end()

    t.end()
})

test('should be able to get all user blogs', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('user', user => {
        user.field('name')
        user.many('blog', 'posted_by', blog => {
            blog.field('name')
        })
    })

    const row = await client.query(query.toSql()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        user: [
            { 
                name: 'Remco',
                blog: [
                    {
                        name: 'Blog about cats',
                    },
                ]
            },
            {
                name: 'Harry',
                blog: [
                    {
                        name: 'Blog about computers',
                    }
                ]
            }
        ]
    })

    await client.end()

    t.end()
})


test('should be able to get all user comments', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('user', user => {
        user.field('name')
        user.many('blog', 'posted_by', blog => {
            blog.field('name')

            blog.many('comment', comment => {
                comment.field('message')
            })
        })
    })

    const row = await client.query(query.toSql()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        user: [
            { 
                name: 'Remco',
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
                ]
            },
            {
                name: 'Harry',
                blog: [
                    {
                        name: 'Blog about computers',
                        comment: [
                            {
                                message: 'Amazing blog!'
                            },
                            {
                                message: 'I agree with this blog'
                            },
                            {
                                message: 'Very nerdy, i agree'
                            }
                        ]
                    }
                ]
            }
        ]
    })

    await client.end()

    t.end()
})

test('should be able to get all users their blogs and their comments', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('user', user => {
        user.field('name')

        user.many('blog', 'posted_by', blog => {
            blog.field('name')
        })

        user.many('comment', 'posted_by', comment => {
            comment.field('message')
        })
    })

    const row = await client.query(query.toSql()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        user: [ 
            {
                name: 'Remco',
                blog: [
                    {
                        name: 'Blog about cats',
                    },
                ],
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
                name: 'Harry',
                blog: [
                    {
                        name: 'Blog about computers',
                    },
                ],
                comment: [
                    {
                        message: 'Amazing blog!'
                    },
                    {
                        message: 'I agree with this blog'
                    },
                    {
                        message: 'Very nerdy, i agree'
                    }
                ]
            }
        ]
    })

    await client.end()

    t.end()
})

test('should be able to get all users their blogs and their comments', async (t) => {
    const client = await connect()

    const query = graphQuery()

    query.source('user', user => {
        user.field('name')

        user.many('blog', 'posted_by', blog => {
            blog.field('name')
        })

        user.many('comment', 'posted_by', comment => {
            comment.field('message')
        })
    })

    const row = await client.query(query.toSql()).then(result => result.rows[0])

    t.deepEqual(row.data, {
        user: [ 
            {
                name: 'Remco',
                blog: [
                    {
                        name: 'Blog about cats',
                    },
                ],
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
                name: 'Harry',
                blog: [
                    {
                        name: 'Blog about computers',
                    },
                ],
                comment: [
                    {
                        message: 'Amazing blog!'
                    },
                    {
                        message: 'I agree with this blog'
                    },
                    {
                        message: 'Very nerdy, i agree'
                    }
                ]
            }
        ]
    })

    await client.end()

    t.end()
})