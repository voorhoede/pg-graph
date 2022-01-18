export { graphQuery } from './graph'
export { installPlugin } from './plugins'


import { graphQuery } from '.'
import { installPlugin } from './plugins'
import { keysetPagination } from './plugins/builtin/keyset-pagination'
import { OrderDirection } from './sql-ast'

const q = graphQuery()

installPlugin(keysetPagination())

q.source('pagination_test', test => {
    test.keysetPagination({
        pageSize: 10,
        cursor: Buffer.from(`{"id" : 11, "name": "Comment 11"}`).toString('base64')
    })
    test.orderBy('name', OrderDirection.ASC)
    test.field('name')
})

console.log(q.toSql())
