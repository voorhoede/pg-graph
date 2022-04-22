export { graphQuery } from './graph'
export { installPlugin } from './plugins'


import { Tables } from '../types'
import { graphQuery } from './graph'
import { OrderDirection } from './sql-ast'

const x = graphQuery()
x.source('Tree', q => {
    q.field('created_at')

    q.where('id', '=', 10)

    q.where((w) => {
        w('name', '=', 10).and('created_at', '=', new Date())
        .and((w2) => {
            w2('coordinates', '=', 'dsd')
        })
    })

    q.agg((b) => {
        b.count({
            filter: (w) => {
                w('id', '=', 1)
            }
        })
    })

    q.many('TreeRelation', 'tree_id', (q) => {
        q.field('tree_id')

        q.where('group_id', '=', 3)
    })

    q.one('Event', b => {
        b.field('gathering_point')
    })

    q.orderBy('created_at', OrderDirection.ASC)
    
})
