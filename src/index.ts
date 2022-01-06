export { graphQuery } from './graph'

import { graphQuery } from './graph'

const query = graphQuery()

query.source('blog', blog => {
    blog.field('name')
    blog.many('comment', comment => {
        comment.field('message')
    })
})

console.log(query.toSql())