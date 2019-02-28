const fs = require('fs')
const path = require('path')

const readdir = require('recursive-readdir')
const jsonfile = require('jsonfile')

const config = require('./config')

const MISSING_INDEX_PATH = path.resolve(__dirname, 'missing-index.json')
let missing_index = []

const saveIndexes = () => {
  console.log(`Saving index: ${missing_index.length}`)
  jsonfile.writeFileSync(MISSING_INDEX_PATH, missing_index, { spaces: 2 })
}


const processFiles = (files) => {
  for (let i=0; i<files.length; i++) {
    const filename = path.basename(files[i])
    const dest = path.resolve(config.dest, filename)
    const exists = fs.existsSync(dest)
    if (!exists) missing_index.push(files[i])
  }
}

const main = async () => {
  try {
    for (let i=0; i<config.src.length; i++) {
      console.log(`Scanning: ${config.src[i]}`)
      const files = await readdir(config.src[i])
      console.log(`Files: ${files.length}`)
      await processFiles(files)
      saveIndexes()
    }
  } catch (e) {
    console.log(e)
  }

  saveIndexes()
}

main()
