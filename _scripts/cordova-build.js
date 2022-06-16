

const DIST_FOLDER_NAME = "android-dist";
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const util = require('util');
const fsExists = util.promisify(fs.exists);
const fsMkdir = util.promisify(fs.mkdir);
const fsReadFile = util.promisify(fs.readFile);
const fsWriteFile = util.promisify(fs.writeFile);
const fsRm = util.promisify(fs.rm);
const fsCopy = util.promisify(fse.cp);
const exec = util.promisify(require('child_process').exec);
const xml2js = require('xml2js');
const parseXMLString = util.promisify(xml2js.parseString);
const createXMLStringFromObject = function (obj) {
    var builder = new xml2js.Builder();
    return builder.buildObject(obj);
};
const archiver = require('archiver');

(async function () {
    try {
        var sourceDirectory = path.join(__dirname, "..")
        console.log("Using source directory: " + sourceDirectory)
        // Remove the dist folder if it already exists
        var buildDirectory = path.join(sourceDirectory, "build");
        console.log("Using build directory: " + buildDirectory)
        if (!await fsExists(buildDirectory)) {
            await fsMkdir(buildDirectory);
        }
        var distDirectory = path.join(buildDirectory, DIST_FOLDER_NAME)
        console.log("Using dist directory: " + distDirectory)
        if (await fsExists(distDirectory)) {
            await fsRm(distDirectory, { recursive: true, force: true });
        }

        // Create the outline of the cordova project
        console.log("Creating cordova outline");
        var cordovaTemplateDirectory = path.join(sourceDirectory, "node_modules/cordova-template");
        if (await fsExists(cordovaTemplateDirectory)) {
            await fsCopy(cordovaTemplateDirectory, distDirectory, { recursive: true, force: true });
            console.log("Was able to recycle previously built outline");
        }
        if (!await fsExists(cordovaTemplateDirectory)) {
            var addCordovaPlugin = async function (pluginName) {
                await exec("cd " + distDirectory + " && npx cordova plugin add " + pluginName );
                console.log("Installed " + pluginName);
            }
            var addNpmPackage = async function (packageName) {
                await exec(" cd " + distDirectory + " && npm install " + packageName);
                console.log("Installed " + packageName);
            }
            await exec("cd " + buildDirectory + " && npx cordova create " + DIST_FOLDER_NAME);
            await addCordovaPlugin("cordova-plugin-background-mode");
            await addCordovaPlugin("cordova-plugin-theme-detection" );
            await addCordovaPlugin("cordova-plugin-advanced-background-mode" );
            await addCordovaPlugin("cordova-plugin-media" );
            await addCordovaPlugin("https://github.com/ghenry22/cordova-plugin-music-controls2.git" );
            await addCordovaPlugin("cordova-plugin-android-permissions" );

            await addNpmPackage("browserify");
            await addNpmPackage("https://github.com/jvilk/BrowserFS.git");

            var wwwroot = path.join(distDirectory, "www")
            if (await fsExists(wwwroot)) {
                await fsRm(wwwroot, { recursive: true, force: true });
            }
            try {
                await fsCopy(distDirectory, cordovaTemplateDirectory, { recursive: true, force: true });
            } catch (exception) {
                console.log(exception);
            }
        }
        var sourcePackageUri = path.join(sourceDirectory, "package.json");
        var sourcePackage = JSON.parse((await fsReadFile(sourcePackageUri)).toString());

        var destinationPackageUri = path.join(distDirectory, "package.json");
        var destinationPackage = JSON.parse((await fsReadFile(destinationPackageUri)).toString());

        destinationPackage.name = "io.freetubeapp." + sourcePackage.name;
        destinationPackage.displayName = sourcePackage.productName;
        destinationPackage.version = sourcePackage.version;
        destinationPackage.author = sourcePackage.author;
        destinationPackage.repository = sourcePackage.repository;
        destinationPackage.bugs = sourcePackage.bugs;
        destinationPackage.license = sourcePackage.license;
        destinationPackage.description = sourcePackage.description;
        destinationPackage.private = sourcePackage.private;

        var apkName = sourcePackage.name + "-" + sourcePackage.version + ".apk";
        var exportType = "cordova";
        if (process.argv.length > 2) {
            apkName = process.argv[2];
        }
        if (process.argv.length > 3) {
            exportType = process.argv[3];
        }

        var browserfsPath = path.join(distDirectory, "www/browserfs");
        // Copy dist folder into cordova project;
        console.log("Copying dist output to cordova outline");
        await fsCopy(path.join(sourceDirectory, "dist"), wwwroot, { recursive: true, force: true });

        console.log("Write static archive for browserfs");
        var staticArchive = archiver("zip");
        var output = fs.createWriteStream(path.join(wwwroot, "static.zip"));
        staticArchive.pipe(output);
        staticArchive.directory(path.join(wwwroot, "static"), false);
        staticArchive.finalize();
        // Wait until finished making zip
         await new Promise(function (resolve, reject) {
            output.on('close', function () {
                resolve()
            });
            output.on('error', function (error) {
                reject(error);
            })
        });

        console.log("Copying browserfs dist to cordova www folder")
        await fsCopy(path.join(distDirectory, "node_modules/browserfs"), path.join(wwwroot, "browserfs"),  { recursive: true, force: true });
        var browserifyConfig = {
            // Override Browserify's builtins for buffer/fs/path.
            builtins: Object.assign({}, require(path.join(distDirectory, 'node_modules/browserify/lib/builtins')), {
                "buffer": require.resolve(path.join(wwwroot + "browserfs/dist/shims/buffer.js")),
                "fs": require.resolve(path.join(wwwroot, "browserfs/dist/shims/fs.js")),
                "path": require.resolve(path.join(wwwroot, "browserfs/dist/shims/path.js"))
            }),
            insertGlobalVars: {
                // process, Buffer, and BrowserFS globals.
                // BrowserFS global is not required if you include browserfs.js
                // in a script tag.
                "process": function () { return "require('browserfs/dist/shims/process.js')" },
                'Buffer': function () { return "require('buffer').Buffer" },
                "BrowserFS": function() { return "require('" + browserfsPath + "')" }
            }
        };
        destinationPackage.browserify = browserifyConfig;
        console.log("Writing package.json in cordova project");
        await fsWriteFile(destinationPackageUri, JSON.stringify(destinationPackage, null, 2));


        // Running browserify on the renderer to remove to allow app to run in browser frame
        console.log("Running browserify on cordova project");
        await exec("cd " + __dirname + "/../build/" + DIST_FOLDER_NAME + "/" + " && npx browserify www/renderer.js -o www/renderer.js");

        var rendererContent = (await fsReadFile( __dirname + "/../build/" + DIST_FOLDER_NAME + "/" + "www/renderer.js")).toString();
        rendererContent = rendererContent.replace(/([^(){}?.;:=,`&]*?)\(\)(\.(readFile|readFileSync|readdirSync|writeFileSync|writeFile|existsSync)\((.[^\)]*)\))/g, 'fileSystem$2');
        rendererContent = rendererContent.replace(/\)([^(){}?.;:=,`&]*?)\(\)(\.(readFile|readFileSync|readdirSync|writeFileSync|writeFile|existsSync)\((.[^\)]*)\))/g, ';fileSystem$2');
        rendererContent = rendererContent.replace(/(this.showOpenDialog)\(([^\(\)]*?)\)/g, "showFileLoadDialog($2);")
        rendererContent = rendererContent.replace(/(this.showSaveDialog)\(([^\(\)]*?)\)/g, "showFileSaveDialog($2);")
        rendererContent = rendererContent.replace(/const store (= localforage.createInstance)/g, `const store = window.dataStore $1`);
        if (exportType === "cordova") {
            rendererContent = rendererContent.replace(/this.invidiousGetVideoInformation\(this.videoId\).then\(/g, "this.invidiousGetVideoInformation(this.videoId).then(updatePlayingVideo);this.invidiousGetVideoInformation\(this.videoId\).then(")
            rendererContent = rendererContent.replace("systemTheme:function(){return window.matchMedia(\"(prefers-color-scheme: dark)\").matches?\"dark\":\"light\"}", "systemTheme:function () { return window.isDarkMode }")
        }
        // This enables channel view
        rendererContent = rendererContent.replaceAll("this.getChannelInfoInvidious(),this.getPlaylistsInvidious()}else this.getVideoInformationInvidious()", "this.getChannelInfoInvidious(),this.getPlaylistsInvidious()}else this.getChannelInfoInvidious(),this.getPlaylistsInvidious()");
        console.log("Setting up browserfs in the renderer");
        await fsWriteFile( __dirname + "/../build/" + DIST_FOLDER_NAME + "/" + "www/renderer.js", `(async function () {
            ` + ((exportType === "cordova")?`
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
              
            }, 500);`:'')
            + `BrowserFS.install(window);
            var staticData = await (await fetch('static.zip')).arrayBuffer();
            // Configure the browserfs before the renderer code
            await new Promise(function (resolve, reject) {
                BrowserFS.configure({
                    fs: "MountableFileSystem",
                    options: {
                        "/static": {
                            fs: "ZipFS",
                            options: {
                                zipData: Buffer.from(staticData)
                            }
                        },
                        "/www": {
                            fs: "MountableFileSystem",
                            options: {
                                "/static": {
                                    fs: "ZipFS",
                                    options: {
                                        zipData: Buffer.from(staticData)
                                    }
                                }
                            }
                        },
                        "/uploads": {
                            fs: "InMemory"
                        }
                    }
                }, function(e) {
                    if (e) {
                    reject(e);
                    } else {
                    resolve();
                    }
                });
            });
            var psuedoFileSystem = require("fs");
            window.fileSystem = {
                writeFile: function (pathlike, content, cb) {
                    download(pathlike, content).then(cb);
                },
                writeFileSync: function (pathlike, content) {
                    download(pathlike, content);
                },
                readFile: function (pathlike, cb) {
                    if (pathlike.startsWith("null/") || pathlike.startsWith("/null/")) {
                        // If the pathlike starts with null, it mean we are trying to read from the localforage
                        var pathParts = pathlike.split("/");
                        var pathEnd = pathParts[pathParts.length - 1];
                        dataStore.getItem(pathEnd, cb);
                    } else {
                        psuedoFileSystem.readFile(pathlike, cb);
                    }
                },
                readFileSync: psuedoFileSystem.readFileSync,
                readdirSync: psuedoFileSystem.readdirSync,
                readdir: psuedoFileSystem.readdir,
                exists: psuedoFileSystem.exists,
                existsSync: psuedoFileSystem.existsSync
            }
            
            function download(filename, textInput) {
                if (filename === undefined) {
                    try {
                        JSON.parse(textInput);
                        // if it can be parsed into json
                        filename = "export.json";
                    } catch {
                        try {
                            JSON.parse(textInput.split("\\n")[0]);
                            // if a line can be parsed, it is probably that weird db format
                            filename = "export.db";
                        } catch {
                            
                        }
                    }
                }
                return new Promise(function (resolve, reject) {
                    var fileNameArray = filename.split("/");
                    filename = fileNameArray[fileNameArray.length - 1];
                    // Run both methods because each will only work in their respective environments
                    var element = document.createElement('a');
                    var url = URL.createObjectURL(new Blob([textInput], {type: "application/octet-stream"}));
                    element.setAttribute("href", url);
                    if (filename === undefined) {
                    try {
                        JSON.parse(textInput);
                        // if it can be parsed into json
                        filename = "export.json";
                    } catch {
                        filename = "export"
                    }
                    }
                    var uri = encodeURI(filename);
                    element.setAttribute('download', filename);
                    document.body.appendChild(element);
                    element.click();
                    document.body.removeChild(element);
                    ` + ((exportType === "cordova")?`
                    function whenHasPermission () {
                    window.requestFileSystem(LocalFileSystem.PERSISTENT, 10000, function (fs) {
                        window.resolveLocalFileSystemURL(cordova.file.externalApplicationStorageDirectory, function (dir) {
                        dir.getFile(filename, { create: true, exclusive: false}, function (fileEntry) {
                            fileEntry.createWriter(function (fileWriter) {
                            fileWriter.onerror = console.error;
                            fileWriter.onwriteend = console.log;
                            fileWriter.write(textInput);
                            resolve();
                            });
                        }, reject);
                        });

                    });
                    }
                    var permissions = cordova.plugins.permissions;
                    permissions.hasPermission(permissions.WRITE_EXTERNAL_STORAGE, function (status) {
                    if (!status.hasPermission) {
                        permissions.requestPermission(permissions.WRITE_EXTERNAL_STORAGE, function (status) {
                        if( status.hasPermission ) {
                            whenHasPermission();
                        }
                        }, reject);
                    } else {
                        whenHasPermission();
                    }
                    }, reject);
                    `:"") + `
                });
              }
              window.showFileSaveDialog = function (fileDialogObject) {
                return new Promise(function (resolve, reject) {
                    fileDialogObject.filePath = fileDialogObject.options.defaultPath;
                    resolve(fileDialogObject);
                });
              };
              window.showFileLoadDialog = function (fileDialogObject) {
                  return new Promise(function (resolve, reject) {
                      // If opening a file
                      if (fileDialogObject.properties.indexOf("openFile") !== -1) {
                          var fileInput = document.createElement("input");
                          fileInput.setAttribute("type", "file");
                          fileInput.onchange = function() {
                              try {
                                var reader = new FileReader();
                                reader.onload = function (theFile) {
                                    psuedoFileSystem.writeFile("/uploads/" + fileInput.files[0].name, theFile.currentTarget.result, function (error) {
                                        if (error) {
                                            reject(error);
                                        } else {
                                            resolve({ filePaths: ["/uploads/" + fileInput.files[0].name] });
                                        }
                                    })
                                }
                                reader.readAsText(fileInput.files[0]);
                              }
                              catch (exception) {
                                  reject(exception);
                              }
                          }
                          fileInput.click();
                      }
                  });
              };
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
              ` + ((exportType === "cordova")?`
              window.isDarkMode = "light";
              if (await new Promise(function (resolve, reject) { cordova.plugins.ThemeDetection.isAvailable(resolve, reject) }) ) {
                    var isDarkMode = await new Promise(function (resolve, reject) { cordova.plugins.ThemeDetection.isDarkModeEnabled(function (result) { resolve(result.value) },reject) });
                    if (isDarkMode) {
                        window.isDarkMode = "dark";
                    }
              }`:"") + `
        ` + rendererContent + `
        }());
        `);
        // Commenting out the electron exports because they will not exist in cordova
        var content = (await fsReadFile(__dirname + "/../build/" + DIST_FOLDER_NAME + "/www/renderer.js")).toString();
        content = content.toString().replace("module.exports = getElectronPath();", "// commenting out this line because it doesn't work in cordova\r\n// module.exports = getElectronPath();");
        await fsWriteFile(__dirname + "/../build/" + DIST_FOLDER_NAME + "/www/renderer.js", content);
        
        var indexContent = (await fsReadFile(__dirname + "/../build/" + DIST_FOLDER_NAME + "/www/index.html")).toString();
        indexContent = indexContent.replace("</title>", "</title><link rel=\"shortcut icon\" href=\"./_icons/icon.ico\" /><script src=\"browserfs/dist/browserfs.js\"></script>");
        if (exportType === "cordova") {
            indexContent = indexContent.replace("</title>", "</title><script src=\"cordova.js\"></script>");
        }
        if (exportType === "browser") {
            indexContent = indexContent.replace('<link rel="manifest" href="static/manifest.json"/>', "<link rel=\"manifest\" href=\"manifest.webmanifest\" />");
        }
        await fsWriteFile(__dirname + "/../build/" + DIST_FOLDER_NAME + "/www/index.html", indexContent);
        // Copy the icons to the cordova directory
        console.log("Copying icons into cordova project");
        await fsMkdir(__dirname + "/../build/" + DIST_FOLDER_NAME + "/res");
        await fsMkdir(__dirname + "/../build/" + DIST_FOLDER_NAME + "/res/icon");
        await fsCopy(__dirname + "/../_icons/.icon-set", __dirname + "/../build/" + DIST_FOLDER_NAME + "/res/icon/android", { recursive: true, force: true });
        await fsCopy(__dirname + "/../_icons/icon.svg", __dirname + "/../build/" + DIST_FOLDER_NAME + "/res/icon/android/background.xml");
        
        // Copy the values from the package.json into the config.xml
        var configAddon = `<platform name="android">
        <icon background="res/icon/android/background_16x16.png" density="ldpi" foreground="res/icon/android/icon_16x16_padded.png" />
        <icon background="res/icon/android/background_32x32.png" density="mdpi" foreground="res/icon/android/icon_32x32_padded.png" />
        <icon background="res/icon/android/background_48x48.png" density="hdpi" foreground="res/icon/android/icon_48x48_padded.png" />
        <icon background="res/icon/android/background_64x64.png" density="xhdpi" foreground="res/icon/android/icon_64x64_padded.png" />
        <icon background="res/icon/android/background_128x128.png" density="xxhdpi" foreground="res/icon/android/icon_128x128_padded.png" />
        <icon background="res/icon/android/background.png" density="xxxhdpi" foreground="res/icon/android/iconColor_256_padded.png" />
    </platform>
    <preference name="AndroidPersistentFileLocation" value="Compatibility" />
    <preference name="AllowInlineMediaPlayback" value="true"/>`;
        var configXML = await parseXMLString(await fsReadFile(__dirname + "/../build/" + DIST_FOLDER_NAME + "/config.xml"));
        configXML.widget.$.id = "io.freetubeapp." + sourcePackage.name;
        configXML.widget.$.version = sourcePackage.version;
        configXML.widget.author[0].$.email = sourcePackage.author.email;
        configXML.widget.author[0]._ = sourcePackage.author.name;
        configXML.widget.author[0].$.href = sourcePackage.author.url;
        configXML.widget.name[0] = sourcePackage.productName;
        configXML.widget.description[0] = sourcePackage.description;
        var xmlString = createXMLStringFromObject(configXML);
        console.log("Writing config.xml to cordova project");
        await fsWriteFile(__dirname + "/../build/" + DIST_FOLDER_NAME + "/config.xml", xmlString.replace("</widget>", configAddon + "</widget>"));

        // Adding export platforms to cordova
        console.log("Adding platforms to cordova project");
        if (exportType === "cordova") {
            await exec("cd " + __dirname + "/../build/" + DIST_FOLDER_NAME + " && npx cordova platform add android");
        }
        await exec("cd " + __dirname + "/../build/" + DIST_FOLDER_NAME + " && npx cordova platform add browser");
        if (exportType === "cordova") {
            // Run the apk build
            console.log("Building apk file");
            await exec("cd " + __dirname + "/../build/" + DIST_FOLDER_NAME + " && npx cordova build android");
            // Copy the apk to the build dir
            console.log("Copying apk file to build directory");
            await fsCopy(__dirname + "/../build/" + DIST_FOLDER_NAME + "/platforms/android/app/build/outputs/apk/debug/app-debug.apk", __dirname + "/../build/" + apkName);
        } else if (exportType === "browser") {
            console.log("Copying output directory to build directory");
            await fsCopy(__dirname + "/../build/" + DIST_FOLDER_NAME + "/www/", __dirname + "/../build/" + apkName, { recursive: true, force: true });
            var manifest = {
                "background_color": "white",
                "description": sourcePackage.description,
                "display": "standalone",
                "icons": [
                    {
                        "src": "_icons/icon.ico",
                        "sizes": "256x256",
                        "type": "image/ico"
                    }
                ],
                "name": sourcePackage.productName,
                "short_name": sourcePackage.productName,
                "start_url": "./index.html"
            };
            await fsWriteFile(__dirname + "/../build/" + apkName + "/manifest.webmanifest",JSON.stringify(manifest, null, 2));
        }
    } catch (exception) {
        throw exception;
    }
}());