import localforage from '../node_modules/localforage/dist/localforage'
import android from 'android'

export function createInstance(kwargs) {
  const instance = localforage.createInstance(kwargs)
  return {
    async getItem(key) {
      const dataLocationFile = android.readFile('data://', 'data-location.json')
      if (dataLocationFile !== '') {
        const locationInfo = JSON.parse(dataLocationFile)
        const locationMap = Object.fromEntries(locationInfo.files.map((file) => { return [file.fileName, file.uri] }))
        if (key in locationMap) {
          return android.readFile(locationMap[key], '')
        }
      }
      const data = android.readFile("data://", key)
      return data
    },
    async setItem(key, value) {
      const dataLocationFile = android.readFile('data://', 'data-location.json')
      if (dataLocationFile !== '') {
        const locationInfo = JSON.parse(dataLocationFile)
        const locationMap = Object.fromEntries(locationInfo.files.map((file) => { return [file.fileName, file.uri] }))
        if (key in locationMap) {
          return android.writeFile(locationMap[key], '', value)
        }
      }
      android.writeFile("data://", key, value)
    }
  }
}
