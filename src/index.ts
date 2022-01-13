export { graphQuery } from './graph'
import { graphQuery } from '.'

const query = graphQuery()

query.source('user', user => {
    user.field('name')

    // user
    //     .throughMany('comment', 'posted_by')
    //     .one('blog', q => {
    //         q.field('name')
    //     })

    user
        .throughMany('domains') // point to comment
        .throughMany('sites') // blog_id?
        .throughMany('blogs') // point to comment
        .one('comment', q => {
            q.field('message')
        })

    user.where('name', '=', 'Remco')
})

console.log(query.toSql())

// const query = graphQuery()

// query.source('user', user => {
//     user.field('name')

//     // user
//     //     .throughOne('sites') // blog_id?
//     //     .throughOne('blogs') // point to comment
//     //     .many('comment', q => {
//     //         q.field('message')
//     //     })

//     user
//         .throughMany('sites') // blog_id?
//         .throughMany('blogs') // point to comment
//         .one('comment', q => {
//             q.field('message')
//         })

//     //site.blog_id
//     //blog.comment_id
//     //INNER JOIN blogs ON (blogs.id = comment.blog_id)
//     //INNER JOIN sites ON (sites.id = blogs.site_id)

//     user.where('name', '=', 'Remco')
// })

// console.log(query.toSql())