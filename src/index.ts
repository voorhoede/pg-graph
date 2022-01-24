export { graphQuery } from './graph'
export { installPlugin } from './plugins'

// import { graphQuery } from '.'
// import { installPlugin } from './plugins'
// import { keysetPagination } from './plugins/builtin/keyset-pagination'
// import { OrderDirection } from './sql-ast'

// const query = graphQuery()

// query.source('user', user => {
//     user.field('name')

//     user
//         .throughMany('blog', 'posted_by')
//         .many('comment', 'bloggy_id', q => {
//             q.field('message')
//         })

//     user.where('name', '=', 'Remco')
// })

// const q = graphQuery()

// //installPlugin(keysetPagination())

// q.source('tree', tree => {
//     tree.agg(agg => {
//         agg.count()
//     })

//     tree.many('tree_relations', (q) => {
//         q.agg(agg => {
//             agg.count()
//         })
//     })

//     tree.atLeast(2)
// })

// console.log(query.toSql())
