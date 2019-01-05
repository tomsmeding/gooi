#!/usr/bin/env node
"use strict";

const Gooi = require('../main.js');
const toClipboard = require("to-clipboard");
const path = require('path');
const fs = require('fs');

function stderr(/* strings */) {
	const args = Array.prototype.slice.call(arguments);
	process.stderr.write(args.join(' ') + '\n');
}

function usageandexit(code) {
	stderr("Usage: gooi [-cqh] <file>");
	stderr("Uploads the given file and provides a handy, short-lived, shareable download link.");
	stderr("  -c         Copy the link to the clipboard");
	stderr("  -q         Only print the URL");
	stderr("  -n <name>  Use the given name for the uploaded file instead of the default")
	stderr("  -t         Trim filename from the given URL")
	stderr("  -h         Show this");
	process.exit(code);
}

const configsDir = process.env['XDG_CONFIG_HOME'] || `${process.env['HOME']}/.config/`;
const configFile = path.join(configsDir, 'gooi', 'config.json');
const config = require(configFile);

if (config.url == null) {
	stderr('config: url required');
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
			stderr(`Unrecognised flag '${arg[j]}'`);
			usageandexit(1);
		}
		if (arg[j] == "n") {
			if (i == process.argv.length - 1) {
				stderr("File name expected after '-n'");
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
	stderr("No filename given!");
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
		if (!opts.q) stderr('(copied)');
	}
}).catch(e => {
	stderr('error while uploading:', e);
});
