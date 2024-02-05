import android from 'android'

export const STATE_PLAYING = 3
export const STATE_PAUSED = 2

/**
 * @typedef SaveDialogResponse
 * @property {boolean} canceled
 * @property {'SUCCESS'|'USER_CANCELED'} type
 * @property {string?} uri
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
 * Requests a save with a dialog
 * @param {string} fileName name of requested file
 * @param {string} fileType mime type
 * @returns {Promise<SaveDialogResponse>} either a uri based on the user's input or a cancelled response
 */
export async function requestSaveDialog(fileName, fileType) {
  // request a 💾save dialog
  const promiseId = android.requestSaveDialog(fileName, fileType)
  // await the promise returned from the ☕ bridge
  const response = await window.awaitAsyncResult(promiseId)
  // handle case if user cancels prompt
  if (response === 'USER_CANCELED') {
    return {
      canceled: true,
      type: response,
      uri: null
    }
  } else {
    return {
      canceled: false,
      type: 'SUCCESS',
      uri: response
    }
  }
}

/**
 * @param {string} arg1 base uri or path
 * @param {string} arg2 path or content
 * @param {string?} arg3 content or undefined
 * @returns
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
