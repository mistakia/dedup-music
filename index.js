const fs = require('fs')
const path = require('path')

const jsonfile = require('jsonfile')
const sha256File = require('sha256-file')
const readdir = require('recursive-readdir')

const config = require('./config')

const FILE_INDEX_PATH = path.resolve(__dirname, 'file-index.json')
let file_index = {}
try {
  file_index = jsonfile.readFileSync(FILE_INDEX_PATH)
} catch (e) {
  console.log(e)
}


const saveIndex = () => {
  console.log(`Saving index: ${Object.keys(file_index).length}`)
  jsonfile.writeFileSync(FILE_INDEX_PATH, file_index)
}

const processFile = async (file) => {
  const hash = await sha256File(file)
  const exists = !!file_index[hash]

  //TODO: check acoustID fingerprint
  if (!exists) {
    const filename = path.basename(file)
    const dest = path.resolve(config.dest, filename)
    console.log(`Copying to ${dest}`)
    fs.copyFileSync(file, dest)
    file_index[hash] = [file]
  } else {
    console.log(file_index[hash])
    console.log(`${hash} - ${file} - DUPLICATE`)
    const isNewFile = file_index[hash].indexOf(file) === -1
    if (isNewFile) file_index[hash].push(file)
  }
}

const processFiles = async (files) => {
  for (let i=0; i<files.length; i++) {
    await processFile(files[i])
  }
}

const ignore = (file, stats) => {
  const filename = path.basename(file)
  const isDotfile = filename.charAt(0) === '.'
  if (isDotfile) return true

  return false
}

const main = async () => {
  for (let i=0; i<config.src.length; i++) {
    console.log(`Scanning: ${config.src[i]}`)
    const files = await readdir(config.src[i], [ignore])
    await processFiles(files)
    console.log(`Files: ${files.length}`)
    console.log(`Unique Hashes: ${Object.keys(file_index).length}`)
    saveIndex()
  }

  saveIndex()
}

try {
  main()
} catch (e) {
  console.log(e)
}
