/**
 ******************************************************************************
 * @file    js/commands/CloudCommands.js
 * @author  David Middlecamp (david@spark.io)
 * @company Spark ( https://www.spark.io/ )
 * @source https://github.com/spark/spark-cli
 * @version V1.0.0
 * @date    14-February-2014
 * @brief   Cloud commands module
 ******************************************************************************
 Copyright (c) 2014 Spark Labs, Inc.  All rights reserved.

 This program is free software; you can redistribute it and/or
 modify it under the terms of the GNU Lesser General Public
 License as published by the Free Software Foundation, either
 version 3 of the License, or (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 Lesser General Public License for more details.

 You should have received a copy of the GNU Lesser General Public
 License along with this program; if not, see <http://www.gnu.org/licenses/>.
 ******************************************************************************
 */

var when = require('when');
var sequence = require('when/sequence');
var pipeline = require('when/pipeline');

var readline = require('readline');
var SerialPortLib = require("serialport");
var SerialPort = SerialPortLib.SerialPort;
var settings = require('../settings.js');
var BaseCommand = require("./BaseCommand.js");
var prompts = require('../lib/prompts.js');
var ApiClient = require('../lib/ApiClient.js');
var utilities = require('../lib/utilities.js');

var fs = require('fs');
var path = require('path');
var moment = require('moment');
var extend = require('xtend');
var util = require('util');


var CloudCommand = function (cli, options) {
    CloudCommand.super_.call(this, cli, options);
    this.options = extend({}, this.options, options);

    this.init();
};
util.inherits(CloudCommand, BaseCommand);
CloudCommand.prototype = extend(BaseCommand.prototype, {
    options: null,
    name: "cloud",
    description: "simple interface for common cloud functions",


    init: function () {
        this.addOption("claim", this.claimCore.bind(this), "Register a core with your user account with the cloud");
        this.addOption("list", this.listCores.bind(this), "Show what cores are registered with your account");
        this.addOption("remove", this.removeCore.bind(this), "Release a core from your account so that another user may claim it");
        this.addOption("name", this.nameCore.bind(this), "Give a core a name!");
        this.addOption("flash", this.flashCore.bind(this), "Pass a binary, source file, or source directory to a core!");
        this.addOption("compile", this.compileCode.bind(this), "Compile a source file, or directory using the cloud service");
        //this.addOption("binary", this.downloadBinary.bind(this), "Compile a source file, or directory using the cloud service");

        this.addOption("login", this.login.bind(this), "Lets you login to the cloud and stores an access token locally");
        this.addOption("logout", this.logout.bind(this), "Logs out your session and clears your saved access token");
    },

    checkArguments: function (args) {
        this.options = this.options || {};

        if (!this.options.saveBinaryPath && (utilities.contains(args, "--saveTo"))) {
            var idx = utilities.indexOf(args, "--saveTo");
            if ((idx + 1) < args.length) {
                this.options.saveBinaryPath = args[idx + 1];
            }
            else {
                console.log("Please specify a file path when using --saveTo");
            }
        }
    },

    claimCore: function (coreid) {
        if (!coreid) {
            console.error("Please specify a coreid");
            return;
        }

        var api = new ApiClient(settings.apiUrl, settings.access_token);
        if (!api.ready()) {
            return;
        }
        console.log("Claiming core " + coreid);
        api.claimCore(coreid);
    },

    removeCore: function (coreid) {
        if (!coreid) {
            console.error("Please specify a coreid");
            return;
        }

        var api = new ApiClient(settings.apiUrl, settings.access_token);
        if (!api.ready()) {
            return;
        }

        when(prompts.areYouSure())
            .then(function (yup) {
                api.removeCore(coreid).then(function () {
                        console.log("Okay!");
                        process.exit(0);
                    },
                    function (err) {
                        console.log("Didn't remove the core " + err);
                        process.exit(1);
                    });
            },
            function (err) {
                console.log("Didn't remove the core " + err);
                process.exit(1);
            });
    },

    nameCore: function (coreid, name) {
        if (!coreid) {
            console.error("Please specify a coreid");
            return;
        }

        if (!name) {
            console.error("Please specify a name");
            return;
        }

        var api = new ApiClient(settings.apiUrl, settings.access_token);
        if (!api.ready()) {
            return;
        }

        console.log("Renaming core " + coreid);
        api.renameCore(coreid, name);
    },

    flashCore: function (coreid, filePath) {
        if (!coreid) {
            console.error("Please specify a coreid");
            return;
        }

        if (!filePath) {
            console.error("Please specify a binary file, source file, or source directory");
            return;
        }

        if (!fs.existsSync(filePath)) {
            console.error("I couldn't find that: " + filePath);
            return;
        }

        //make a copy of the arguments sans the 'coreid'
        var args = Array.prototype.slice.call(arguments, 1);
        var files = this._handleMultiFileArgs(args);
        if (!files) {
            return;
        }
        if (settings.showIncludedSourceFiles) {
            console.log("Including:");
            for (var key in files) {
                console.log(files[key]);
            }
        }

        var api = new ApiClient(settings.apiUrl, settings.access_token);
        if (!api.ready()) {
            return;
        }
        api.flashCore(coreid, files);
    },

    /**
     * use application ID instead of binary ID
     * @param binary_id
     * @param filename
     */
    downloadBinary: function (binary_id, filename) {
        if (!filename) {
            filename = "firmware_" + (new Date()).getTime() + ".bin";
        }

        var api = new ApiClient(settings.apiUrl, settings.access_token);
        if (!api.ready()) {
            return;
        }


        var binary_url = "/v1/binaries/" + binary_id;
        var allDone = api.downloadBinary(binary_url, filename);

        when(allDone).then(
            function () {
                console.log("saved firmware to " + path.resolve(filename));
                console.log("Firmware Binary downloaded.");
            },
            function (err) {
                console.error("Download failed - ", err);
            });

    },

    compileCode: function (filePath, filename) {
        if (!filePath) {
            console.error("Please specify a binary file, source file, or source directory");
            return;
        }

        if (!fs.existsSync(filePath)) {
            console.error("I couldn't find that: " + filePath);
            return;
        }

        this.checkArguments(arguments);

        //make a copy of the arguments
        var args = Array.prototype.slice.call(arguments, 0);
        var files = this._handleMultiFileArgs(args);
        if (!files) {
            return;
        }

        if (settings.showIncludedSourceFiles) {
            console.log("Including:");
            for (var key in files) {
                console.log(files[key]);
            }
        }

        if (this.options.saveBinaryPath) {
            filename = this.options.saveBinaryPath;
        }
        else {
            //grab the last filename
            filename = (arguments.length > 1) ? arguments[arguments.length - 1] : null;

            //if it's empty, or it doesn't end in .bin, lets assume it's not an output file.
            //NOTE: because of the nature of 'options at the end', and the only option is --saveTo,
            //this should have no side-effects with other usages.  If we did a more sophisticated
            //argument structure, we'd need to change this logic.
            if (!filename || (utilities.getFilenameExt(filename) != ".bin")) {
                filename = "firmware_" + (new Date()).getTime() + ".bin";
            }
        }


        var that = this;
        var api = new ApiClient(settings.apiUrl, settings.access_token);
        if (!api.ready()) {
            return;
        }

        var allDone = pipeline([
            //compile
            function () {
                return api.compileCode(files);
            },

            //download
            function (resp) {
                if (resp && resp.binary_url) {
                    return api.downloadBinary(resp.binary_url, filename);
                }
                else {
                    if (resp.errors) {
                        console.log("Errors");
                        console.log(resp.errors.join("\n"));
                    }
                    return when.reject("compile failed ");
                }
            }
        ]);

        when(allDone).then(
            function () {
                console.log("saved firmware to " + path.resolve(filename));
                console.log("Compiled firmware downloaded.");
            },
            function (err) {
                console.error("Compile failed - ", err);
            });

    },

    login: function () {
        var username = null;

        var allDone = pipeline([

            //prompt for creds
            prompts.getCredentials,

            //login to the server
            function (creds) {
                var api = new ApiClient(settings.apiUrl);
                username = creds[0];
                return api.login("spark-cli", creds[0], creds[1]);
            }
        ]);

        when(allDone).then(function (access_token) {
                console.log("logged in! ", arguments);
                //console.log("Successfully logged in as " + username);
                settings.override("access_token", access_token);
                if (username) {
                    settings.override("username", username);
                }

                setTimeout(function () {
                    process.exit(0);
                }, 1250);
            },
            function (err) {
                console.error("Error logging in " + err);
                process.exit(-1);
            });
    },
    logout: function (dontExit) {
        var api = new ApiClient(settings.apiUrl, settings.access_token);
        if (!settings.access_token) {
            console.log("You were already logged out.");
            return when.resolve();
        }

        var allDone = pipeline([
            function () {
                console.log("");
                console.log("You can perform a more secure logout by revoking your current access_token for the cloud.");
                console.log("Revoking your access_token requires your normal credentials, hit ENTER to skip, or ");
                return prompts.passPromptDfd("enter your password (or blank to skip): ");
            },
            function (pass) {
                if (pass && (pass != "blank")) {
                    //blank... I see what you did there...
                    return api.removeAccessToken(settings.username, pass, settings.access_token);
                }
                else {
                    console.log("Okay, leaving access token as-is! ");
                    return when.resolve();
                }
            },
            function () {
                settings.override("username", null);
                settings.override("access_token", null);
                console.log("You're now logged out!");
                return when.resolve();
            }
        ]);

        if (!dontExit) {
            when(allDone).ensure(function () {
                process.exit(0);
            });
        }

        return allDone;
    },

    listCores: function () {

        var api = new ApiClient(settings.apiUrl, settings.access_token);
        if (!api.ready()) {
            return;
        }


        api.listDevices()
            .then(function (cores) {
                if (!cores || (cores.length == 0)) {
                    console.log("No cores found.");
                    return;
                }

                console.log("Found " + cores.length + " cores ");

                //sort alphabetically
                cores = cores.sort(function (a, b) {
                    return (a.name || "").localeCompare(b.name);
                });

                var lines = [];
                for (var i = 0; i < cores.length; i++) {
                    var core = cores[i];

                    var onlineStr = (core.connected) ? "online" : "offline";
                    var status = "  " + core.name + " (" + core.id + ") is " + onlineStr;
                    lines.push(status);
                }
                lines.push("");

                console.log(lines.join("\n"));
            },
            function (err) {
                console.error("Error listing cores: " + err);
            });
    },

    /**
     * helper function for getting the contents of a directory,
     * checks for '.include', and a '.ignore' files, and uses their contents
     * instead
     * @param dirname
     * @private
     */
    _processDirIncludes: function (dirname) {
        var includesFile = path.join(dirname, settings.dirIncludeFilename),
            ignoreFile = path.join(dirname, settings.dirExcludeFilename),
            ignoreSet = {};

        //check for an include file
        if (fs.existsSync(includesFile)) {
            //grab it as filenames


            return utilities.fixRelativePaths(dirname,
                utilities.trimBlankLines(
                    utilities.readLines(includesFile)
                )
            );
        }

        //otherwise, the includes file was missing or empty.

        //check and load an exclude file
        var excluded = utilities.arrayToHashSet(
            utilities.readLines(ignoreFile)
        );

        var results = [];
        var dirFiles = fs.readdirSync(dirname);
        for (var i = 0; i < dirFiles.length; i++) {
            var filename = dirFiles[i];
            if (excluded[filename]) {
                continue;
            }

            results.push(path.join(dirname, filename));
        }

        return results;
    },


    _handleMultiFileArgs: function (arr) {
        //use cases:
        // compile someDir
        // compile someFile
        // compile File1 File2 File3 output.bin
        // compile File1 File2 File3 --saveTo anotherPlace.bin

        if (!arr || arr.length == 0) {
            return null;
        }

        var filelist = [];

        var files = {};
        var filePath = arr[0];
        var stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            filelist = this._processDirIncludes(filePath);
        }
        else if (stats.isFile()) {
            filelist = arr;
        }
        else {
            console.log("was that a file or directory?");
            return null;
        }


        for (var i = 0; i < filelist.length; i++) {
            var filename = filelist[i];
            if (filename.indexOf("--") == 0) {
                //hit some arguments.
                break;
            }

            if (utilities.getFilenameExt(filename) == ".bin") {
                //hit output binary file
                break;
            }

            var ext = utilities.getFilenameExt(filename).toLowerCase();
            if (utilities.contains(settings.notSourceExtensions, ext)) {
                continue;
            }

            if (!fs.existsSync(filename)) {
                console.error("I couldn't find the file " + filename);
                return null;
            }

            var filestats = fs.statSync(filename);
            if (filestats.size > settings.MAX_FILE_SIZE) {
                console.log("Skipping " + filename + " it's too big! " + stats.size);
                continue;
            }

            if (i == 0) {
                files['file'] = filename;
            }
            else {
                files['file' + i] = filename;
            }
        }

        return files;
    },


    _: null
});

module.exports = CloudCommand;
