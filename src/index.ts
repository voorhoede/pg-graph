export { graphQuery } from './graph'
export { installPlugin } from './plugins'

import { graphQuery } from '.'
import { installPlugin } from './plugins'
import { keysetPagination } from './plugins/builtin/keyset-pagination'
import { OrderDirection } from './sql-ast'

const q = graphQuery()

//installPlugin(keysetPagination())

q.source('tree', tree => {
    tree.agg(agg => {
        agg.count()
    })

    tree.many('tree_relations', (q) => {
        q.agg(agg => {
            agg.count()
        })
    })

    tree.atLeast(2)
})

console.log(q.toSql())
