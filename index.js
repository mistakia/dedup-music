const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const fpcalc = require('fpcalc')
const ffmpeg = require('fluent-ffmpeg')
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
const FINGERPRINT_INDEX_PATH = path.resolve(__dirname, 'fingerprint-index.json')
let fingerprint_index = {}
try {
  fingerprint_index = jsonfile.readFileSync(FINGERPRINT_INDEX_PATH)
} catch (e) {
  console.log(e)
}

const IGNORED_INDEX_PATH = path.resolve(__dirname, 'ignored-index.json')
let ignored_index = []
try {
  ignored_index = jsonfile.readFileSync(IGNORED_INDEX_PATH)
} catch (e) {
  console.log(e)
}

const DUPLICATE_INDEX_PATH = path.resolve(__dirname, 'duplicate-index.json')
let duplicate_index = {}
try {
  duplicate_index = jsonfile.readFileSync(DUPLICATE_INDEX_PATH)
} catch (e) {
  console.log(e)
}

const saveIndexes = () => {
  console.log(`Saving index: ${Object.keys(file_index).length}`)
  jsonfile.writeFileSync(FILE_INDEX_PATH, file_index, { spaces: 2 })
  jsonfile.writeFileSync(FINGERPRINT_INDEX_PATH, fingerprint_index, { spaces: 2 })
  jsonfile.writeFileSync(DUPLICATE_INDEX_PATH, duplicate_index, { spaces: 2 })
  jsonfile.writeFileSync(IGNORED_INDEX_PATH, index_path, { spaces: 2 })
}

const getAcoustID = (filepath) => {
  return new Promise((resolve, reject) => {
    fpcalc(filepath, (err, result) => {
      if (err) return reject(err)
      resolve(result)
    })
  })
}

const getMetadata = (filepath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filepath, (err, metadata) => {
      if (err) return reject(err)
      resolve(metadata)
    })
  })
}

const getSha256File = (filepath) => {
  return new Promise((resolve, reject) => {
    sha256File(filepath, (err, hash) => {
      if (err) return reject(err)
      resolve(hash)
    })
  })
}

const getSha256 = (string) => {
  const sum = crypto.createHash('sha256')
  sum.update(string)
  return sum.digest('hex')
}

const updateFileIndex = (hash, filepath) => {
  const exists = !!file_index[hash]

  if (!exists) {
    const filename = path.basename(filepath)
    const dest = path.resolve(config.dest, filename)
    console.log(`Copying to ${dest}`)
    fs.copyFileSync(filepath, dest)
    file_index[hash] = [filepath]
    return
  }

  console.log(file_index[hash])
  console.log(`${hash} - ${filepath} - DUPLICATE`)
  const isNewFile = file_index[hash].indexOf(filepath) === -1
  if (isNewFile) file_index[hash].push(filepath)
}

const updateDuplicateIndex = async (hash, filepath) => {
  try {
    const metadata = await getMetadata(filepath)
    const exists = !!duplicate_index[hash]
    exists ? duplicate_index[hash].push(metadata) : duplicate_index[hash] = [metadata]
  } catch (e) {
    console.log(e)
  }
}

const updateFingerprintIndex = async (hash, filepath) => {
  const exists = !!fingerprint_index[hash]

  if (!exists) {
    return fingerprint_index[hash] = [filepath]
  }

  await updateDuplicateIndex(hash, filepath)
}

const processFile = async (file) => {

  let exists = false
  let filehash
  let fingerprinthash
  try {
    const acoustID = await getAcoustID(file)
    fingerprinthash = getSha256(acoustID.fingerprint)
    filehash = await getSha256File(file)
    updateFileIndex(filehash, file)
    await updateFingerprintIndex(fingerprinthash, file)
  } catch (e) {
    console.log(e)
  }

}

const processFiles = async (files) => {
  try {
    for (let i=0; i<files.length; i++) {
      await processFile(files[i])
    }
  } catch (e) {
    console.log(e)
  }
}

const ignoreFile = (file, stats) => {
  const filename = path.basename(file)
  const isDotfile = filename.charAt(0) === '.'
  if (isDotfile) return true

  const isURL = filename.slice(-4) === '.url'
  if (isURL) return true

  return false
}

const getAudioFiles = async (files) => {
  let result = []

  try {
    for (let i=0; i<files.length; i++) {
      const metadata = await getMetadata(files[i])
      const { streams } = metadata
      const isAudio = streams.find(s => s.codec_type === 'audio')
      if (!isAudio) {
        console.log(metadata)
        ignored_index.push(files[i])
      }
      result.push(files[i])
    }
  } catch (e) {
    console.log(e)
  }

  return result
}

const main = async () => {
  try {
    for (let i=0; i<config.src.length; i++) {
      console.log(`Scanning: ${config.src[i]}`)
      const files = await readdir(config.src[i], [ignoreFile])
      const audio_files = await getAudioFiles(files)
      await processFiles(files)
      console.log(`Files: ${files.length}`)
      console.log(`Unique Hashes: ${Object.keys(file_index).length}`)
      saveIndexes()
    }
  } catch (e) {
    console.log(e)
  }

  saveIndexes()
}

main()
