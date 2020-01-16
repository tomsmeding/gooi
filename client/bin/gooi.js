#!/usr/bin/env node
"use strict";

const Gooi = require('../main.js');
const toClipboard = require("to-clipboard");
const path = require('path');
const fs = require('fs');

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

function parseNetrc(text) {
	const result = new Map();
	let current = null;
	for (let line of text.split("\n")) {
		if (line.match(/^\s*$/)) continue;
		const m = line.match(/^\s*(\S+)\s+(.*)$/);
		if (!m) continue;
		const key = m[1];
		const value = m[2];
		switch (key) {
			case "machine":
				current = {login: null, password: null};
				result.set(value, current);
				break;
			case "login":
			case "password":
				current[key] = value;
				break;
		}
	}
	return result;
}

let config;
try {
	config = require(configFile);
} catch(e) {
	console.error(`Error: Could not read config file: ${e}`);
	console.error("");
	usageandexit(1);
}

if (config.url != null) {
	console.warn('config: "url" is deprecated, please use "hostname"');
	if (config.hostname == null) {
		config.hostname = config.url;
		delete config.url;
	}
}
if (config.hostname == null) {
	console.error('config: hostname required');
	process.exit(1);
}
config.port = config.port || 443;
config.prefix = config.prefix || '/gooi/';
if (config.netrc != null) {
	const credentials = parseNetrc(fs.readFileSync(config.netrc).toString()).get(config.hostname);
	if (credentials != null) {
		config.auth = credentials.login + ":" + credentials.password;
	}
	delete config.netrc;
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
