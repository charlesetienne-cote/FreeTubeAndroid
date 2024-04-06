
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'


// sets the splashscreen & icon to one of three predefined themes (this makes it easier to tell, at a glance, which one is open)
// - release (the default production look)
// - nightly
// OR
// - development

const COLOURS = {
  RELEASE: {
    primary: '#f04242',
    secondary: '#14a4df',
    back: '#E4E4E4',
    backDark: '#212121'
  },
  // catppucin mocha theme colours
  NIGHTLY: {
    primary: '#cdd6f4',
    secondary: '#cdd6f4',
    back: '#1e1e2e',
    backDark: '#1e1e2e'
  },
  // inverted release colours
  DEVELOPMENT: {
    primary: '#E4E4E4',
    secondary: '#E4E4E4',
    back: '#f04242',
    backDark: '#f04242'
  }
}
let colour = 'RELEASE'
for (const key in COLOURS) {
  if (process.argv.indexOf(`--${key.toLowerCase()}`) !== -1) {
    colour = key
  }
}

const currentTheme = COLOURS[colour]

const scriptDir = fileURLToPath(import.meta.url)
const drawablePath = join(scriptDir, '../../android/app/src/main/res/drawable/')

const foreground = join(drawablePath, 'ic_launcher_foreground.xml')
let foregroundXML = (await readFile(foreground)).toString()
foregroundXML = foregroundXML.replace(/<path android:fillColor="[^"]*?" android:strokeWidth="0\.784519" android:pathData="M 27/g, `<path android:fillColor="${currentTheme.primary}" android:strokeWidth="0.784519" android:pathData="M 27`)
foregroundXML = foregroundXML.replace(/<path android:fillColor="[^"]*?" android:strokeWidth="0\.784519" android:pathData="M 18/g, `<path android:fillColor="${currentTheme.primary}" android:strokeWidth="0.784519" android:pathData="M 18`)
foregroundXML = foregroundXML.replace(/<path android:fillColor="[^"]*?" android:strokeWidth="0\.784519" android:pathData="M 28/g, `<path android:fillColor="${currentTheme.secondary}" android:strokeWidth="0.784519" android:pathData="M 28`)
await writeFile(foreground, foregroundXML)

const background = join(drawablePath, 'ic_launcher_background.xml')
let backgroundXML = (await readFile(background)).toString()
backgroundXML = backgroundXML.replace(/android:fillColor="[^"]*?" \/>/g, `android:fillColor="${currentTheme.back}" />`)
await writeFile(background, backgroundXML)

const lightTheme = join(scriptDir, '..', '..', 'android/app/src/main/res/values-v31/themes.xml')
let lightThemeXml = (await readFile(lightTheme)).toString()
lightThemeXml = lightThemeXml.replace(/<item name="android:windowSplashScreenBackground">[^"]*?<\/item>/g, `<item name="android:windowSplashScreenBackground">${currentTheme.back}</item>`)
lightThemeXml = lightThemeXml.replace(/<item name="android:windowSplashScreenIconBackgroundColor">[^"]*?<\/item>/g, `<item name="android:windowSplashScreenIconBackgroundColor">${currentTheme.back}</item>`)
await writeFile(lightTheme, lightThemeXml)

const darkTheme = join(scriptDir, '..', '..', 'android/app/src/main/res/values-night-v31/themes.xml')
let darkThemeXml = (await readFile(darkTheme)).toString()
darkThemeXml = darkThemeXml.replace(/<item name="android:windowSplashScreenBackground">[^"]*?<\/item>/g, `<item name="android:windowSplashScreenBackground">${currentTheme.backDark}</item>`)
darkThemeXml = darkThemeXml.replace(/<item name="android:windowSplashScreenIconBackgroundColor">[^"]*?<\/item>/g, `<item name="android:windowSplashScreenIconBackgroundColor">${currentTheme.backDark}</item>`)
await writeFile(darkTheme, darkThemeXml)
