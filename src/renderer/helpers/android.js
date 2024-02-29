import android from 'android'

export const STATE_PLAYING = 3
export const STATE_PAUSED = 2
export const MIME_TYPES = {
  db: 'application/octet-stream',
  json: 'application/json',
  csv: 'text/comma-separated-values',
  opml: 'application/octet-stream',
  xml: 'text/xml'
}
export const FILE_TYPES = Object.fromEntries(Object.entries(MIME_TYPES).map(([key, value]) => [value, key]))

/**
 * @typedef SaveDialogResponse
 * @property {boolean} canceled
 * @property {'SUCCESS'|'USER_CANCELED'} type
 * @property {string?} uri
 * @property {string[]} filePaths
 */

/**
 * creates a new media session / or updates the previous one
 * @param {string} title
 * @param {string} artist
 * @param {number} duration
 * @param {string?} cover
 * @returns {Promise<void>}
 */
export function createMediaSession(title, artist, duration, cover = null) {
  android.createMediaSession(title, artist, duration, cover)
}

/**
 * Updates the current media session's state
 * @param {number} state the playback state, either `STATE_PAUSED` or `STATE_PLAYING`
 * @param {number?} position playback position in milliseconds
 */
export function updateMediaSessionState(state, position = null) {
  android.updateMediaSessionState(state?.toString() || null, position)
}

/**
 * Handles the response of a `requestDialog` function from the bridge
 * @param {string} promiseId
 * @returns {Promise<SaveDialogResponse>} either a uri based on the user's input or a cancelled response
 */
async function handleDialogResponse(promiseId) {
  // await the promise returned from the ☕ bridge
  let response = await window.awaitAsyncResult(promiseId)
  // handle case if user cancels prompt
  if (response === 'USER_CANCELED') {
    return {
      canceled: true,
      type: null,
      uri: null,
      filePaths: []
    }
  } else {
    response = JSON.parse(response)
    let typedUri = response?.uri
    if (response?.type in FILE_TYPES && typedUri.indexOf('.') === -1) {
      typedUri = `${typedUri}.${FILE_TYPES[response?.type]}`
    }
    return {
      canceled: false,
      type: 'SUCCESS',
      uri: response.uri,
      filePaths: [typedUri]
    }
  }
}

/**
 * Requests a save file dialog
 * @param {string} fileName name of requested file
 * @param {string} fileType mime type
 * @returns {Promise<SaveDialogResponse>} either a uri based on the user's input or a cancelled response
 */
export function requestSaveDialog(fileName, fileType) {
  // request a 💾save dialog
  const promiseId = android.requestSaveDialog(fileName, fileType)
  return handleDialogResponse(promiseId)
}

/**
 * Requests an open file dialog
 * @param {string[]} fileType mime type of acceptable inputs
 * @returns {Promise<SaveDialogResponse>} either a uri based on the user's input or a cancelled response
 */
export function requestOpenDialog(fileTypes) {
  const types = Array.from(new Set(fileTypes.map((type) => type in MIME_TYPES ? MIME_TYPES[type] : type)))

  // request a 🗄file open dialog
  const promiseId = android.requestOpenDialog(types.join(','))
  return handleDialogResponse(promiseId)
}

/**
 * @param {string} arg1 base uri or path
 * @param {string} arg2 path or content
 * @param {string?} arg3 content or undefined
 * @returns {boolean} was able to successfully write?
 */
export function writeFile(arg1, arg2, arg3 = undefined) {
  let baseUri, path, content
  if (arg3 === undefined) {
    baseUri = arg1
    path = ''
    content = arg2
  } else {
    baseUri = arg1
    path = arg2
    content = arg3
  }
  return android.writeFile(baseUri, path, content)
}

/**
 * a soft file read which returns '' if the file doesn't exist yet
 * @param {string} baseUri base of the uri
 * @param {string?} path (optional) path on top of base
 * @returns {string} file contents or '' if no file was found
 */
export function readFile(baseUri, path = '') {
  return android.readFile(baseUri, path)
}

/**
 * @typedef ContentResultsInfo
 * @property {string} trimmedContent the original content, trimmed of whitespace
 * @property {boolean} startsLikeJson whether file content appears to be json-like
 * @property {boolean} startsLikeXml whether file content appears to be xml
 * @property {string} fileType the portion of the file path after the last dot
 * @property {boolean} reportsOpml whether or not the file type is 'opml'
 */

/**
 * @typedef ContentResults
 * @property {'db'|'opml'|string} type the determined real file type
 * @property {ContentResultsInfo} info the information which lead to this conclusion
 */

/**
 * detects the real file type of an `octet-stream` mime-typed file in android
 * @param {string} content
 * @param {string} filePath
 * @returns {ContentResults}
 */
export function detectAmbiguousContent(content, filePath) {
  const trimmedContent = content.trim()
  const startsLikeJson = trimmedContent[0] === '{'
  const startsLikeXml = trimmedContent[0] === '<'
  const fileType = filePath.slice(filePath.lastIndexOf('.'), filePath.length)
  const reportsOpml = fileType === 'opml'
  const type = startsLikeJson && reportsOpml
    ? 'db'
    : startsLikeXml && reportsOpml
      ? 'opml'
      : fileType
  return {
    type,
    info: {
      trimmedContent,
      startsLikeJson,
      startsLikeXml,
      fileType,
      reportsOpml
    }
  }
}

/**
 * @param {string} filePath
 * @param {string} newFileType
 * @returns {string}
 */
export function replaceFileType(filePath, newFileType) {
  return `${filePath.slice(0, filePath.lastIndexOf('.'))}.${newFileType}`
}

/**
 *
 * @param {string} content
 * @param {string} filePath
 * @returns
 */
export function handleAmbigiousContent(content, filePath) {
  const { type, info } = detectAmbiguousContent(content, filePath)
  if (info.fileType !== type) {
    filePath = replaceFileType(filePath, type)
  }
  return filePath
}
