export { graphQuery } from './graph'
import { graphQuery } from './graph'

const query = graphQuery()

query.source('user', user => {
    user.field('name')

    user.where(q => {
        q('name', '=', 'bla').and(() => {
            q('email', '=', 'something-else')
                .or('count', '=', 1)
        })
    })
})

console.log(query.toSql())

// 

// query.source('user', user => {
//     user.field('name')
//     user.many('blog', 'posted_by', blog => {
//         blog.field('name')

//         blog.many('comment', comment => {
//             comment.field('message')
//         })
//     })
// })

// console.log(query.toSql())