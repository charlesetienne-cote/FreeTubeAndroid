

const DIST_FOLDER_NAME = "android-dist";
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

(async function () {
    try {
        // Remove the dist folder if it already exists
        if (!await fsExists(__dirname + "/../build")) {
            await fsMkdir(__dirname + "/../build");
        }
        if (await fsExists(__dirname + "/../build/" + DIST_FOLDER_NAME)) {
            var type = "browser";
            if (process.argv.length > 2) {
                type = process.argv[2];
            }
            await exec("cd " + __dirname + "/../build/" + DIST_FOLDER_NAME + " && npx cordova run " + type);
        } else {
            console.log("No cordova build found.");
            console.log("Run: ");
            console.log(" npm run build:cordova");
        }
    } catch (exception) {
        console.log(exception);
    }
}());