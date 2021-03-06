const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const fpcalc = require('fpcalc')
const ffmpeg = require('fluent-ffmpeg')
const jsonfile = require('jsonfile')
const sha256File = require('sha256-file')
const readdir = require('recursive-readdir')
const level = require('level')
const id = require('nanoid')

const config = require('./config')

const FILE_INDEX_PATH = path.resolve(__dirname, 'file-index')
let file_index = level(FILE_INDEX_PATH)

const FINGERPRINT_INDEX_PATH = path.resolve(__dirname, 'fingerprint-index')
let fingerprint_index = level(FINGERPRINT_INDEX_PATH)

const IGNORED_INDEX_PATH = path.resolve(__dirname, 'ignored-index.json')
let ignored_index = []
try {
  ignored_index = jsonfile.readFileSync(IGNORED_INDEX_PATH)
} catch (e) {
  console.log(e)
}

const DUPLICATE_INDEX_PATH = path.resolve(__dirname, 'duplicate-index')
let duplicate_index = level(DUPLICATE_INDEX_PATH)

const saveIndexes = () => {
  console.log(`Saving index: ${Object.keys(ignored_index).length}`)
  jsonfile.writeFileSync(IGNORED_INDEX_PATH, ignored_index, { spaces: 2 })
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

const updateFileIndex = async (hash, filepath) => {
  const exists = await file_index.get(hash).catch(err => {})

  if (exists) {
    let items = JSON.parse(exists)
    console.log(items)
    console.log(`${hash} - ${filepath} - DUPLICATE`)
    const isNewFile = items.indexOf(filepath) === -1
    if (isNewFile) {
      items.push(filepath)
      try {
        await file_index.put(hash, JSON.stringify(items))
      } catch (e) {
        console.log(e)
      }
    }

    return exists
  }

  const filename = `${id(4)}-${path.basename(filepath)}`
  const dest = path.resolve(config.dest, filename)
  console.log(`Copying to ${dest}`)
  fs.copyFileSync(filepath, dest)
  try {
    await file_index.put(hash, JSON.stringify([filepath]))
  } catch (e) {
    console.log(e)
  }
  return exists
}

const updateDuplicateIndex = async (hash, filepath) => {
  try {
    const metadata = await getMetadata(filepath)
    const exists = await duplicate_index.get(hash).catch(err => {})
    if (exists) {
      let items = JSON.parse(exists)
      items.push(metadata)
      await duplicate_index.put(hash, JSON.stringify(items))
    } else {
      await duplicate_index.put(hash, JSON.stringify([metadata]))
    }
  } catch (e) {
    console.log(e)
  }
}

const updateFingerprintIndex = async (hash, filepath) => {
  const exists = await fingerprint_index.get(hash).catch(err => {})

  if (!exists) {
    await fingerprint_index.put(hash, JSON.stringify([filepath]))
    return
  }

  let items = JSON.parse(exists)
  items.push(filepath)
  await fingerprint_index.put(hash, JSON.stringify(items))

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
    const exists = await updateFileIndex(filehash, file)
    if (!exists) await updateFingerprintIndex(fingerprinthash, file)
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
  const isDirectory = stats.isDirectory()
  if (isDirectory) return false

  const filename = path.basename(file)
  const isDotfile = filename.charAt(0) === '.'
  if (isDotfile) return true

  const extension = path.extname(filename)

  const acceptedExts = [
    '.mp2', '.mp3', '.mp4', '.flac', '.wav',
    '.m4a', '.m4p', '.aif', '.aiff', '.aifc'
  ]

  const isAcceptedExts = acceptedExts.indexOf(extension) > -1
  return !isAcceptedExts
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
      console.log(`Files: ${files.length}`)
      const audio_files = await getAudioFiles(files)
      console.log(`Audio Files: ${audio_files.length}`)
      await processFiles(files)
      saveIndexes()
    }
  } catch (e) {
    console.log(e)
  }

  saveIndexes()
}

main()
