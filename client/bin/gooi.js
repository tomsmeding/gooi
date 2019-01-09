#!/usr/bin/env node
"use strict";

const Gooi = require('../main.js');
const toClipboard = require("to-clipboard");
const path = require('path');
const fs = require('fs');

function usageandexit(code) {
	console.error("Usage: gooi [-cqh] <file>");
	console.error("Uploads the given file and provides a handy, short-lived, shareable download link.");
	console.error("  -c         Copy the link to the clipboard");
	console.error("  -q         Only print the URL");
	console.error("  -n <name>  Use the given name for the uploaded file instead of the default")
	console.error("  -t         Trim filename from the given URL")
	console.error("  -h         Show this");
	process.exit(code);
}

const configsDir = process.env['XDG_CONFIG_HOME'] || `${process.env['HOME']}/.config/`;
const configFile = path.join(configsDir, 'gooi', 'config.json');
const config = require(configFile);

if (config.url == null) {
	console.error('config: url required');
	process.exit(1);
}
config.port = config.port || 443;
config.prefix = config.prefix || '/gooi/';

const gooi = new Gooi(config.url, config.port, config.prefix);

let opts = {};
let fnames = [];
let uploadFname = null;
let skipnextarg = false;
for (let i = 2; i < process.argv.length; i++) {
	if (skipnextarg) {
		skipnextarg = false;
		continue;
	}
	const arg = process.argv[i];
	if (arg[0] != '-') {
		fnames.push(arg);
		continue;
	}
	for (let j = 1; j < arg.length; j++) {
		if ("chnqt".indexOf(arg[j]) == -1) {
			console.error(`Unrecognised flag '${arg[j]}'`);
			usageandexit(1);
		}
		if (arg[j] == "n") {
			if (i == process.argv.length - 1) {
				console.error("File name expected after '-n'");
				process.exit(1);
			}
			uploadFname = process.argv[i + 1];
			skipnextarg = true;
		} else {
			opts[arg[j]] = true;
		}
	}
}
if (opts.h) usageandexit(0);
if (fnames.length == 0) {
	console.error("No filename given!");
	usageandexit(1);
}

gooi.gooi(fnames, {
	uploadFname: uploadFname,
}).then(url => {
	if (opts.t) {
		url = url.replace(/\/[^\/]*$/, '');
	}

	console.log(url);

	if (opts.c) {
		toClipboard.sync(url.trim());
		if (!opts.q) console.error('(copied)');
	}
}).catch(e => {
	console.error('error while uploading:', e);
});
