const pg = require('pg')
const fs = require('fs')
const path = require('path')

const conn = new pg.Client('postgres://postgres@localhost:5433')

async function timeout(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

async function attemptConnect() {
    try {
        await conn.connect()
    }
    catch(e) {
        await timeout(500)
        return attemptConnect()
    }
}

;(async function main() {

    await attemptConnect()

    const sql = await fs.promises.readFile(path.join(__dirname, './seed.sql'), 'utf8')

    await conn.query(sql)

    console.log('seed done')

    await conn.end()

    process.exit(0)
})()
