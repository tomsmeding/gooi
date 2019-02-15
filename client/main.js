"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");
const yazl = require("yazl");

function upload(gooi, stream, filename) {
	return new Promise((resolve, reject) => {
		const req = https.request({
			protocol: "https:",
			hostname: gooi.hostname,
			port: gooi.port,
			method: "POST",
			path: path.join(gooi.prefix, encodeURIComponent(filename)),
			headers: {
				"Content-Type": "application/octet-stream",
				"Transfer-Encoding": "chunked",
			}
		});

		req.on("response", res => {
			const success = res.statusCode === 200;
			if (!success) reject(res);

			res.setEncoding("utf8");
			let bodytext = "";
			res.on("data", data => {
				if (success) bodytext += data;
			});
			res.on("end", () => {
				if (success) resolve(bodytext.trim());
			});
		});
		req.on("error", e => reject(e));

		stream.pipe(req);
	});
}

function enumerateFiles(fnames) {
	let res = [];
	for (let file of fnames) {
		if (!Array.isArray(file)) {
			file = [file, path.basename(file)];
		}

		const stat = fs.statSync(file[0]);

		if (stat.isFile()) {
			res.push(file);
		} else if (stat.isDirectory()) {
			const items =
				fs.readdirSync(file[0])
					.map((f) => [ file[0]+"/"+f, file[1]+"/"+f ]);
			res = res.concat(enumerateFiles(items));
		}
	}
	return res.map((f) => [ path.normalize(f[0]), f[1] ]);
}

function createZipStream(basename, fnames) {
	const zipfile = new yazl.ZipFile();
	for (let file of fnames) {
		const filepath = path.join(basename, file[1])
		zipfile.addFile(file[0], filepath);
	}
	zipfile.end();

	return zipfile.outputStream;
}

function makeFilenameSafe(fname) {
	if (fname == null) {
		return fname;
	}

	return fname.replace(/^.*\//, "").replace(/[\0-\x1f\x7f-\xff]/g, "?");
}

module.exports = class Gooi {
	constructor(hostname, port, prefix) {
		this.hostname = hostname;
		this.port = port;
		this.prefix = prefix;
	}

	async gooi(fnames, params = {}) {
		if (fnames == null || fnames.length === 0) {
			throw new Error("No files to gooi");
		} else if (!Array.isArray(fnames)) {
			fnames = [ fnames ];
		}

		if (fnames.length !== 1 || fs.statSync(fnames[0]).isDirectory()) {
			const zipname =
				makeFilenameSafe(params.uploadFname)
				|| new Date().getTime().toString() + ".zip";

			const stream = createZipStream(
				zipname.replace(/\.zip$/, ""),
				enumerateFiles(fnames),
			);

			return await upload(this, stream, zipname);
		} else {
			return await upload(
				this,
				fs.createReadStream(fnames[0]),
				makeFilenameSafe(params.uploadFname || fnames[0])
			);
		}
	}

	vang(id) {
		// TODO
	}
}
