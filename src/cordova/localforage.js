import localforage from '../../node_modules/localforage/dist/localforage'
import { requestDirectory, readFromFile, writeToFile } from '../renderer/helpers/cordova'

export function createInstance(kwargs) {
  const instance = localforage.createInstance(kwargs)
  return {
    async getItem(key) {
      const fs = await requestDirectory()
      const data = await readFromFile(fs, key)
      // if the data is empty, fallback to localstorage
      if (data === '') return instance.getItem(key)
      // if not, return the data
      return data
    },
    async setItem(key, value) {
      const fs = await requestDirectory()
      await writeToFile(fs, key, value)
    }
  }
}
