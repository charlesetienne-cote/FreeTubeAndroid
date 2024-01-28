import android from 'android'

export const STATE_PLAYING = 3
export const STATE_PAUSED = 2

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

export function updateMediaSessionState(state, position = 0) {
  android.updateMediaSessionState(state, position)
}
