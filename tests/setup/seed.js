const pg = require('pg')
const fs = require('fs')
const path = require('path')

async function timeout(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

async function attemptConnect() {
    const conn = new pg.Client('postgres://postgres@localhost:5433')
    try {
        await conn.connect()
        return conn
    }
    catch(e) {
        console.log('db not ready...re-attempt in 1 second')
        await timeout(1000)
        return attemptConnect()
    }
}

;(async function main() {
    const conn = await attemptConnect()

    const sql = await fs.promises.readFile(path.join(__dirname, './seed.sql'), 'utf8')

    await conn.query(sql)

    console.log('seed done')

    await conn.end()

    process.exit(0)
})()
