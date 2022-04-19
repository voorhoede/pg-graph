export { graphQuery } from './graph'
export { installPlugin } from './plugins'


import { Tables } from '../types'
import { graphQuery } from './graph'
import { OrderDirection } from './sql-ast'

type TableName = Tables['__tableName']
type TableForTableName<Name> = Extract<Tables, { __tableName: Name }>

//type X = TableForTableName<'AuthConnection'>

const x = graphQuery<Tables>()
x.source('Tree', q => {
    q.field('name')

    q.where('id', '=', 10)

    q.where((w) => {
        w('name', '=', 10).and('created_at', '=', new Date())
    })

    q.agg((b) => {
        b.count({
            filter: (w) => {
                w('id', '=', 1)
            }
        })
    })

    q.orderBy('created_at', OrderDirection.ASC)
    
})
