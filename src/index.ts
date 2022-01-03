export { graphQuery } from './graph'


import { graphQuery } from './graph'

const query = graphQuery()

query.source('comment', comment => {
    // user.many('comment', q => {
    //     //q.through('blog', 'blog_id', 'posted_by')
    // })

    comment.field('message')

    comment
        .through('blog')
        .one('user', 'posted_by', user => {
            user.alias('owner')

            user.field('name')
        })

    // user
    //     .through('blog', 'posted_by')
    //     .has('comment', 'blog_id', comment => {
    //         comment.where('message', '=', 'something here')
    //     })

    // user.many('comment', 'posted_by', comment => {
    //     comment.field('message')
    // })

    // user.through('blog', 'posted_by', blog => {
    //     blog.through('x', q => {
    //         q.many('comment', q => {

    //         })
    //     })
    // })

    // user.many('comment', 'blog_id', q => {

    // }).through('blog', '')

    // user.many('comment', { through }, q => {

    // })
})

console.log(query.toSql(), query.values())