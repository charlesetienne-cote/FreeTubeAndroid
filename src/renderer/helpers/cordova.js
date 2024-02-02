import cordova from 'cordova'

/**
 * @typedef FileOptions
 * @property {boolean} create
 * @property {boolean} exclusive
 */

/**
 * @typedef Writer
 * @property {Function} onerror
 * @property {Function} write
 */

/**
 * @callback CreateWriterCallback
 * @param {Writer} writer
 * @returns {void}
 */

/**
 * @callback CreateWriter
 * @param {CreateWriterCallback} callback
 * @returns {void}
 */

/**
 * @callback GetBlobCallback
 * @param {Blob} blob
 * @returns {void}
 */

/**
 * @callback GetBlob
 * @param {GetBlobCallback} callback
 */

/**
 * @typedef FileReference
 * @property {CreateWriter} createWriter
 * @property {GetBlob} file
 */

/**
 * @callback GetFileCallback
 * @param {FileReference} file
 */

/**
 * @callback GetFile
 * @param {string} patch
 * @param {FileOptions} options
 * @param {GetFileCallback} callback
 * @returns {void}
 */

/**
 * @typedef FileSystemHook
 * @property {GetFile} getFile
 */

/**
 *
 * @param {string} directory this *must* be one of the accepted cordova file keys "cordova.file.*""
 * @returns {Promise<FileSystemHook>} a filesystem hook that starts in the given directory
 */
export function requestDirectory(directory = cordova.file.externalApplicationStorageDirectory) {
  return new Promise((resolve, _reject) => {
    window.requestFileSystem(window.LocalFileSystem.PERSISTENT, 10000, function (_) {
      window.resolveLocalFileSystemURL(directory, resolve)
    })
  })
}

/**
 *
 * @param {FileSystemHook} fsHook
 * @param {string} path
 * @param {string} content
 * @param {FileOptions} options
 * @returns {Promise<void>}
 */
export function writeToFile(fsHook, path, content, options = { create: true, exclusive: false }) {
  return new Promise((resolve, reject) => {
    fsHook.getFile(path, options, (file) => {
      file.createWriter((writer) => {
        writer.onerror = reject
        writer.write(content)
        resolve()
      })
    })
  })
}

/**
 *
 * @param {FileSystemHook} fsHook
 * @param {string} path
 * @param {string} content
 * @param {FileOptions} options
 * @returns {Promise<string>}
 */
export function readFromFile(fsHook, path) {
  return new Promise((resolve, reject) => {
    fsHook.getFile(path, { create: true, exclusive: false }, (fileEntry) => {
      fileEntry.file((file) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = (e) => reject(e)
        reader.readAsText(file)
      })
    })
  })
}

export function removeFile(fsHook, path) {
  return new Promise((resolve, reject) => {
    fsHook.remove(() => {
      resolve()
    }, (error) => {
      reject(error)
    }, () => {
      reject(new Error('File does not exist'))
    })
  })
}
