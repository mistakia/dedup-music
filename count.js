const path = require('path')
const fs = require('fs')

const level = require('level')

const config = require('./config')

const FILE_INDEX_PATH = path.resolve(__dirname, 'file-index')
let file_index = level(FILE_INDEX_PATH)

let missing = 0
let total = 0
file_index.createReadStream({ keys: false, values: true}).on('data', function (data) {
    const value = JSON.parse(data)
    const file = value[0]
    const filename = path.basename(file)
    const dest = path.resolve(config.dest, filename)
    const exists = fs.existsSync(dest)
    if (!exists) missing++
    total++
})

process.on('exit', () => {
    console.log(`Missing: ${missing}`)
    console.log(`Total: ${total}`)
})
