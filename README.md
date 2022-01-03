# Pg-graph

This library allows you to directly generate json responses in Postgres. Including nested one-to-many and one-to-one relations through a easy to use api.

## When do you need this?

- You are using Postgres as your relational database
- You are using a serverless stack
- You want to generate GraphQL like responses from your api (nested multiple levels), but you are lacking the SQL skills to create the required complicated queries
- You want a library that is lightweight and fast

## Why not PostgREST / Hasura / Graphile?

You need an additional server and you don't have control over the queries that can be done against your database

## Why not Prisma?

- Prisma is very heavy and IMO unsuitable for serverless.
- It generates inefficient queries (subqueries everywhere)

## Why is pg-graph a good solution?

It does not try to hide the SQL. You use it in combination with `pg`.
The following code generates a query to get relations 3 levels deep:

```
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
```

Get the SQL code through the `toSql` method:

```
const sql = query.toSql()
```

Run it with `pg`

```
const row = await client.query(sql).then(result => result.rows[0])

console.log(row.data)
```

Note that your data is ready to be returned from you api. No need to loop through all rows and convert it to json.

## TODO

- Add support for one-to-one relations X
- Test prepared statement variables X
- Formatting queries so that they are actually readable
- Many to many (manyThrough)?
- Aggregrations like count, avg, sum
- Where exists
- Pagination
- Add support for auto camel-casing all keys
- Compile query into function
- Insertion / Updating values?