import localforage from '../node_modules/localforage/dist/localforage'
import android from 'android'

export function createInstance(kwargs) {
  const instance = localforage.createInstance(kwargs)
  return {
    async getItem(key) {
      const data = android.readFile("data://", key)
      if (data === '') return instance.getItem(key)
      return data
    },
    async setItem(key, value) {
      android.writeFile("data://", key, value)
    }
  }
}
