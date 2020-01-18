#!/usr/bin/env node
"use strict";

const Gooi = require('../main.js');
const toClipboard = require("to-clipboard");
const path = require('path');

const configsDir = process.env['XDG_CONFIG_HOME'] || `${process.env['HOME']}/.config/`;
const configFile = path.join(configsDir, 'gooi', 'config.json');

function usageandexit(code) {
	console.error("Usage: gooi [flags...] <file>");
	console.error("Uploads the given file and provides a handy, short-lived, shareable download link.");
	console.error("  -c         Copy the link to the clipboard");
	console.error("  -q         Only print the URL");
	console.error("  -n <name>  Use the given name for the uploaded file instead of the default")
	console.error("  -t         Trim filename from the given URL")
	console.error("  -h         Show this");
	console.error("");
	console.error(`A JSON configuration file is required at ${configFile},`);
	console.error("with the following structure:");
	console.error("  {");
	console.error("    \"hostname\": \"your.gooi.server.com\",");
	console.error("    \"netrc\": \"/path/to/netrc/file\"     // optional");
	console.error("  }");
	process.exit(code);
}

let config;
try {
	config = Gooi.readConfig(configFile);
} catch (e) {
	console.error(e.toString());
	console.error("");
	usageandexit(1);
}

const gooi = new Gooi(config);

const opts = {};
const fnames = [];
let uploadFname = null;
let skipnextarg = false;
for (let i = 2; i < process.argv.length; i++) {
	if (skipnextarg) {
		skipnextarg = false;
		continue;
	}
	const arg = process.argv[i];
	if (arg[0] !== '-') {
		fnames.push(arg);
		continue;
	}
	for (let j = 1; j < arg.length; j++) {
		if ("chnqt".indexOf(arg[j]) === -1) {
			console.error(`Unrecognised flag '${arg[j]}'`);
			usageandexit(1);
		}
		if (arg[j] === "n") {
			if (i === process.argv.length - 1) {
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
if (fnames.length === 0) {
	console.error("No filename given!");
	usageandexit(1);
}

gooi.gooi(fnames, {
	uploadFname: uploadFname,
}).then(url => {
	if (opts.t) {
		url = url.replace(/\/[^/]*$/, '');
	}

	console.log(url);

	if (opts.c) {
		toClipboard.sync(url.trim());
		if (!opts.q) console.error('(copied)');
	}
}).catch(e => {
	console.error('error while uploading:', e);
});
