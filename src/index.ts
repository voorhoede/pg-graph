export { graphQuery } from './graph'
export { installPlugin } from './plugins'

import { graphQuery } from '.'
// import { installPlugin } from './plugins'
// import { keysetPagination } from './plugins/builtin/keyset-pagination'
// import { OrderDirection } from './sql-ast'

const query = graphQuery()

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


query.source('user', user => {
    user.field('name')

    // user
    //     .throughMany('comment', 'posted_by')
    //     .one('blog', q => {
    //         q.field('name')
    //     })

    user
        .throughMany('domains') // a user has one domain (user.domain_id = domain.id)
        //.throughMany('sites') // a domain has many sites (site.domain_id = domain.id) 
        .throughOne('sites') // a domain has one site (domain.site_id = site.id) 
        .throughMany('blogs') // a site has many blogs (blog.site_id = site.id)
        .many('comment', q => { // a blog has many comments (comment.blog_id = blog.id)
            q.field('message')
        })

    user.where('name', '=', 'Remco')
})

console.log(query.toSql())