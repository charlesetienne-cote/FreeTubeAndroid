
const DIST_FOLDER_NAME = 'android-dist'
const path = require('path')
const fs = require('fs')
const fse = require('fs-extra')
const util = require('util')
const fsExists = function (path) {
  return new Promise(function (resolve, reject) {
    fs.access(path, function (err, stat) {
      if (err) {
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}
const fsMkdir = util.promisify(fs.mkdir)
const fsReadFile = util.promisify(fs.readFile)
const fsWriteFile = util.promisify(fs.writeFile)
const fsMove = util.promisify(fs.rename)
const fsRm = util.promisify(fs.rm)
const fsCopy = util.promisify(fse.cp)
const exec = util.promisify(require('child_process').exec)
const xml2js = require('xml2js')
const parseXMLString = util.promisify(xml2js.parseString)
const createXMLStringFromObject = function (obj) {
  const builder = new xml2js.Builder()
  return builder.buildObject(obj)
}
const archiver = require('archiver');

(async function () {
  try {
    const sourceDirectory = path.join(__dirname, '..')
    console.log('Using source directory: ' + sourceDirectory)
    // Remove the dist folder if it already exists
    const buildDirectory = path.join(sourceDirectory, 'build')
    console.log('Using build directory: ' + buildDirectory)
    if (!await fsExists(buildDirectory)) {
      await fsMkdir(buildDirectory)
    }
    const distDirectory = path.join(buildDirectory, DIST_FOLDER_NAME)
    console.log('Using dist directory: ' + distDirectory)
    if (await fsExists(distDirectory)) {
      await fsRm(distDirectory, { recursive: true, force: true })
    }

    const wwwroot = path.join(distDirectory, 'www')
    console.log('Using wwwroot: ' + wwwroot)

    // Create the outline of the cordova project
    console.log('Creating cordova outline')
    const cordovaTemplateDirectory = path.join(sourceDirectory, 'node_modules/cordova-template')
    if (await fsExists(cordovaTemplateDirectory)) {
      await fsCopy(cordovaTemplateDirectory, distDirectory, { recursive: true, force: true })
      console.log('Was able to recycle previously built outline')
    }
    if (!await fsExists(cordovaTemplateDirectory)) {
      const addCordovaPlugin = async function (pluginName) {
        await exec('cd ' + distDirectory + ' && npx cordova plugin add ' + pluginName)
        console.log('Installed ' + pluginName)
      }
      const addNpmPackage = async function (packageName) {
        await exec(' cd ' + distDirectory + ' && npm install ' + packageName)
        console.log('Installed ' + packageName)
      }
      await exec('cd ' + buildDirectory + ' && npx cordova create ' + DIST_FOLDER_NAME)
      await addCordovaPlugin('cordova-plugin-background-mode')
      await addCordovaPlugin('cordova-plugin-theme-detection')
      await addCordovaPlugin('cordova-plugin-advanced-background-mode')
      await addCordovaPlugin('cordova-plugin-media')
      await addCordovaPlugin('https://github.com/ghenry22/cordova-plugin-music-controls2.git')
      await addCordovaPlugin('cordova-plugin-save-dialog')
      await addCordovaPlugin('cordova-plugin-android-permissions')
      await addCordovaPlugin('cordova-clipboard')

      await addNpmPackage('browserify')

      if (await fsExists(wwwroot)) {
        await fsRm(wwwroot, { recursive: true, force: true })
      }
      try {
        await fsCopy(distDirectory, cordovaTemplateDirectory, { recursive: true, force: true })
      } catch (exception) {
        console.log(exception)
      }
    }
    const sourcePackageUri = path.join(sourceDirectory, 'package.json')
    const sourcePackage = JSON.parse((await fsReadFile(sourcePackageUri)).toString())

    const destinationPackageUri = path.join(distDirectory, 'package.json')
    const destinationPackage = JSON.parse((await fsReadFile(destinationPackageUri)).toString())

    destinationPackage.name = 'io.freetubeapp.' + sourcePackage.name
    destinationPackage.displayName = sourcePackage.productName
    destinationPackage.version = sourcePackage.version
    destinationPackage.author = sourcePackage.author
    destinationPackage.repository = sourcePackage.repository
    destinationPackage.bugs = sourcePackage.bugs
    destinationPackage.license = sourcePackage.license
    destinationPackage.description = sourcePackage.description
    destinationPackage.private = sourcePackage.private

    let apkName = sourcePackage.name + '-' + sourcePackage.version + '.apk'
    let exportType = 'cordova'
    let keystorePath = null//if null, don't sign the apk
    let keystorePassphrase = null
    if (process.argv.length > 2) {
      apkName = process.argv[2]
    }
    if (process.argv.length > 3) {
      exportType = process.argv[3]
    }
    if (process.argv.length > 4) {
      keystorePath = process.argv[4]
    }
    if (process.argv.length > 5) {
      keystorePassphrase = process.argv[5]
    }
    // Copy dist folder into cordova project;
    console.log('Copying dist output to cordova outline')
    await fsCopy(path.join(sourceDirectory, 'dist', 'web'), wwwroot, { recursive: true, force: true })

    console.log('Writing package.json in cordova project')
    await fsWriteFile(destinationPackageUri, JSON.stringify(destinationPackage, null, 2))

    // Running browserify on the renderer to remove to allow app to run in browser frame
    console.log('Running browserify on cordova project')
    await exec('cd ' + distDirectory + '/' + ' && npx browserify www/renderer.js -o www/renderer.js')

    let rendererContent = (await fsReadFile(path.join(wwwroot, 'renderer.js'))).toString()
    // These escaped characters need to be escaped
    // because they are part of a regular expression
    // and they do not refer to a group
    // they refer to the literal characters '(' and ')'
    /* eslint-disable no-useless-escape */
    // this is a POC, random changes to the codebase break these regex all the time
    rendererContent = rendererContent.replace(/([^(){}?.;:=,`&]*?)\(\)(\.(readFile|readFileSync|readdirSync|writeFileSync|writeFile|existsSync)\((.[^\)]*)\))/g, 'fileSystem$2')
    rendererContent = rendererContent.replace(/\)([^(){}?.;:=,`&]*?)\(\)(\.(readFile|readFileSync|readdirSync|writeFileSync|writeFile|existsSync)\((.[^\)]*)\))/g, ';fileSystem$2')
    //rendererContent = rendererContent.replace(/(this.showSaveDialog)\(([^\(\)]*?)\)/g, 'showFileSaveDialog($2);')
    rendererContent = rendererContent.replace(/([a-zA-Z]*)=([a-zA-Z]*\([1-9]*\))\.createInstance/g, '$1=window.dataStore=$2.createInstance')
    if (exportType === 'cordova') {
      rendererContent = rendererContent.replace(/this.invidiousGetVideoInformation\(this.videoId\).then\(/g, 'this.invidiousGetVideoInformation(this.videoId).then(updatePlayingVideo);this.invidiousGetVideoInformation\(this.videoId\).then(')
      rendererContent = rendererContent.replace('systemTheme:function(){return window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}', 'systemTheme:function () { return window.isDarkMode }')
    } else {
      rendererContent = rendererContent.replaceAll("createNewWindow:function(){", "createNewWindow: window.createNewWindow, electronNewWindow:function(){")
    }
    /* eslint-enable no-useless-escape */
    console.log('Setting up the renderer')
    await fsWriteFile(path.join(wwwroot, 'renderer.js'), `(async function () {
            ` + ((exportType === 'cordova')
        ? `
            var createControls = function (object = {}, success = function () {}) {
                MusicControls.create(object, success);
                var listeners = {};
                var addListener = function (type, funct) {
                    var listenerTypes = Object.keys(listeners);
                    if (listenerTypes.indexOf(type) === -1) {
                      listeners[type] = [];
                    }
                    listeners[type].push(funct);
                }
                var triggerListeners = function (type, value) {
                    var listenerTypes = Object.keys(listeners);
                    if (listenerTypes.indexOf(type) !== -1) {
                      for (var i = 0; i < listeners[type].length; i++) {
                          var listener = listeners[type][i];
                          listener(value);
                      }
                    }
                }
                function events(action) {
                    const message = JSON.parse(action).message;
                    switch(message) {
                    case 'music-controls-next':
                        triggerListeners(message);
                        break;
                    case 'music-controls-previous':
                        triggerListeners(message);
                        // Do something
                        break;
                    case 'music-controls-pause':
                        triggerListeners(message);
                        // Do something
                        break;
                    case 'music-controls-play':
                        triggerListeners(message);
                        // Do something
                        break;
                    case 'music-controls-destroy':
                        triggerListeners(message);
                        // Do something
                        break;
                    case 'music-controls-toggle-play-pause' :
                        triggerListeners(message);
                        // Do something
                        break;
                    // Lockscreen seek controls (iOS only)
                    case 'music-controls-seek-to':
                        const seekToInSeconds = JSON.parse(action).position;
                        MusicControls.updateElapsed({
                        elapsed: seekToInSeconds,
                        isPlaying: true
                        });
                        triggerListeners(message);
                        // Do something
                        break;
                
                    // Headset events (Android only)
                    // All media button events are listed below
                    case 'music-controls-media-button' :
                        // Do something
                        triggerListeners(message);
                        break;
                    case 'music-controls-headset-unplugged':
                        // Do something
                        triggerListeners(message);
                        break;
                    case 'music-controls-headset-plugged':
                        // Do something
                        triggerListeners(message);
                        break;
                    default:
                        triggerListeners(message);
                        break;
                    }
                }

                MusicControls.subscribe(events);
                MusicControls.listen();
                return {
                    addListener: addListener,
                    updateData: function (newObject) {
                            MusicControls.destroy(function () {
                                var newKeys = Object.keys(newObject);
                                for (var i = 0; i < newKeys.length; i++) {
                                object[newKeys[i]] = newObject[newKeys[i]];
                                }
                                MusicControls.create(object);
                            }, function (error) {
                                console.log(error);
                            })
                    }
                }
            }
            var currentVideo = null;
            window.currentControls = null;
            var setupControlsListeners = function (controls) {
              controls.addListener("music-controls-play", function () {
                if (currentVideo !== null) {
                  if (currentVideo.paused) {
                      currentVideo.play();
                  }
                }
              });
              var pauseListener = function () {
                  if (currentVideo !== null) {
                    if (!currentVideo.paused) {
                        currentVideo.pause();
                    }
                  }
              };
              controls.addListener("music-controls-pause", pauseListener);
              controls.addListener("music-controls-headset-unplugged", pauseListener);
              controls.addListener("music-controls-next", function () {
                try {
                    window.location.href = document.querySelector(".playlistItem .watchPlaylistItem .router-link-active").parentNode.parentNode.parentNode.nextElementSibling.querySelector("a").href;
                } catch {
                    try {
                        window.location.href = document.body.querySelector(".recommendation a").href;
                    } catch (exception) {
                        console.log(exception);
                    }
                }
              });
              controls.addListener("music-controls-previous", function () {
                try {
                    window.location.href = document.querySelector(".playlistItem .watchPlaylistItem").parentNode.previousElementSibling.querySelector("a").href;
                } catch {
                    try {
                        history.back();
                    } catch (exception) {
                        console.log(exception);
                    }
                }
              });
            }
            window.updatePlayingVideo = function (videoObject) {
                var videoObject = { track: videoObject.title, artist: videoObject.author, cover: videoObject.videoThumbnails[videoObject.videoThumbnails.length - 4].url };
                currentControls.updateData(videoObject)
                window.currentVideoData = videoObject;
            }
            try {
                // trying to fix the issue where the first controls object created does not have any data
                currentControls = createControls(window.currentVideoData, function () {
                    setupControlsListeners(currentControls);
                    // Destroy any rouge controls that have popped up
                    MusicControls.destroy();
                });
            } catch {

            }
            window.currentVideoData = {};
            setInterval(function () {
              // Check for current video
              var video = document.querySelector('video');
              if (video !== currentVideo) {
                currentVideo = video;
                // setup media controls
                if (video === null || video === undefined) {
                    MusicControls.destroy();
                }
                if (video.getAttribute("data-music-controls-loaded") !== "true") {
                  if (currentControls === null) {
                    currentControls = createControls(window.currentVideoData);
                    setupControlsListeners(currentControls);
                  }
                  video.setAttribute("data-music-controls-loaded", "true");
                  video.onplay = function () {
                    MusicControls.updateIsPlaying(true);
                  }
                  video.onpause = function () {
                    MusicControls.updateIsPlaying(false);
                  }
                  
                }
              }
              
            }, 500);`
        : '') +
            `  
            window.play = function () {
                if (currentVideo !== null) {
                    currentVideo.play();
                }
            };
            Object.defineProperty(window, 'player', {
                get: function () {
                  return currentVideo;
                }
            });
              ` + ((exportType === 'cordova')
        ? `
              window.isDarkMode = "light";
              if (await new Promise(function (resolve, reject) { cordova.plugins.ThemeDetection.isAvailable(resolve, reject) }) ) {
                    var isDarkMode = await new Promise(function (resolve, reject) { cordova.plugins.ThemeDetection.isDarkModeEnabled(function (result) { resolve(result.value) },reject) });
                    if (isDarkMode) {
                        window.isDarkMode = "dark";
                    }
              }
              var removeNewWindowIconStyle = document.createElement('style');
              removeNewWindowIconStyle.innerHTML = ".navNewWindowIcon { display: none !important; }" 
              document.head.appendChild(removeNewWindowIconStyle);
              `
        : `
              window.createNewWindow = function () {
                window.open(window.location.pathname, "_blank")
              };
        `) + `
        ` + rendererContent + `
        }());
        `)
    // Commenting out the electron exports because they will not exist in cordova
    let content = (await fsReadFile(path.join(wwwroot, 'renderer.js'))).toString()
    content = content.toString().replace('module.exports = getElectronPath();', "// commenting out this line because it doesn't work in cordova\r\n// module.exports = getElectronPath();")
    await fsWriteFile(path.join(wwwroot, 'renderer.js'), content)

    let indexContent = (await fsReadFile(path.join(wwwroot, 'index.html'))).toString()
    indexContent = indexContent.replace('</title>', '</title><link rel="shortcut icon" href="./_icons/icon.ico" />')
    if (exportType === 'cordova') {
      indexContent = indexContent.replace('</title>', '</title><script src="cordova.js"></script>')
    }
    if (exportType === 'browser') {
      indexContent = indexContent.replace('<link rel="manifest" href="static/manifest.json"/>', '<link rel="manifest" href="manifest.webmanifest" />')
    }
    await fsWriteFile(path.join(wwwroot, 'index.html'), indexContent)
    // Copy the icons to the cordova directory
    console.log('Copying icons into cordova project')
    await fsMkdir(path.join(distDirectory, 'res'))
    await fsMkdir(path.join(distDirectory, 'res/icon'))
    await fsCopy(path.join(sourceDirectory, '_icons/.icon-set'), path.join(distDirectory, 'res/icon/android'), { recursive: true, force: true })
    await fsCopy(path.join(sourceDirectory, '_icons/icon.svg'), path.join(distDirectory, 'res/icon/android/background.xml'))

    // Copy the values from the package.json into the config.xml
    const configAddon = `<platform name="android">
        <icon background="res/icon/android/background_16x16.png" density="ldpi" foreground="res/icon/android/icon_16x16_padded.png" />
        <icon background="res/icon/android/background_32x32.png" density="mdpi" foreground="res/icon/android/icon_32x32_padded.png" />
        <icon background="res/icon/android/background_48x48.png" density="hdpi" foreground="res/icon/android/icon_48x48_padded.png" />
        <icon background="res/icon/android/background_64x64.png" density="xhdpi" foreground="res/icon/android/icon_64x64_padded.png" />
        <icon background="res/icon/android/background_128x128.png" density="xxhdpi" foreground="res/icon/android/icon_128x128_padded.png" />
        <icon background="res/icon/android/background.png" density="xxxhdpi" foreground="res/icon/android/iconColor_256_padded.png" />
    </platform>
    <preference name="AndroidPersistentFileLocation" value="Compatibility" />
    <preference name="AllowInlineMediaPlayback" value="true"/>`
    const configXML = await parseXMLString(await fsReadFile(path.join(distDirectory, 'config.xml')))
    configXML.widget.$.id = 'io.freetubeapp.' + sourcePackage.name
    configXML.widget.$.version = sourcePackage.version
    configXML.widget.author[0].$.email = sourcePackage.author.email
    configXML.widget.author[0]._ = sourcePackage.author.name
    configXML.widget.author[0].$.href = sourcePackage.author.url
    configXML.widget.name[0] = sourcePackage.productName
    configXML.widget.description[0] = sourcePackage.description
    const xmlString = createXMLStringFromObject(configXML)
    console.log('Writing config.xml to cordova project')
    await fsWriteFile(path.join(distDirectory, 'config.xml'), xmlString.replace('</widget>', configAddon + '</widget>'))

    // Adding export platforms to cordova
    console.log('Adding platforms to cordova project')
    if (exportType === 'cordova') {
      await exec('cd ' + distDirectory + ' && npx cordova platform add android')
    }
    await exec('cd ' + distDirectory + ' && npx cordova platform add browser')
    if (exportType === 'cordova') {
      let buildArguments = ''
      if (keystorePassphrase !== null) {
        // the apk needs to be signed
        buildArguments = '--buildConfig'
        await fsMove(keystorePath, path.join(distDirectory, 'freetubecordova.keystore'));
        await fsWriteFile(path.join(distDirectory, 'build.json'), JSON.stringify({
          "android": {
            "debug": {
                "keystore": "./freetubecordova.keystore",
                "storePassword": keystorePassphrase,
                "alias": "freetubecordova",
                "password" : keystorePassphrase,
                "keystoreType": "jks"
            },
            "release": {
                "keystore": "./freetubecordova.keystore",
                "storePassword": keystorePassphrase,
                "alias": "freetubecordova",
                "password" : keystorePassphrase,
                "keystoreType": "jks"
            }
        }
        }, null, 4));
      }
      // Run the apk build
      console.log('Building apk file')
      await exec('cd ' + distDirectory + ' && npx cordova build android ' + buildArguments)
      // Copy the apk to the build dir
      console.log('Copying apk file to build directory')
      await fsCopy(path.join(distDirectory, 'platforms/android/app/build/outputs/apk/debug/app-debug.apk'), path.join(buildDirectory, apkName))
    } else if (exportType === 'browser') {
      console.log('Copying output directory to build directory')
      await fsCopy(wwwroot, path.join(buildDirectory, apkName), { recursive: true, force: true })
      const manifest = {
        background_color: 'white',
        description: sourcePackage.description,
        display: 'standalone',
        icons: [
          {
            src: '_icons/icon.ico',
            sizes: '256x256',
            type: 'image/ico'
          }
        ],
        name: sourcePackage.productName,
        short_name: sourcePackage.productName,
        start_url: './index.html'
      }
      await fsWriteFile(path.join(buildDirectory, apkName, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2))
    }
  } catch (exception) {
    throw exception
  }
}())
