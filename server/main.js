#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import getMime from "./mime.js";

const app = express();
const httpServer = http.Server(app);

const HTTPHOST = process.env['GOOI_HTTP_HOST'] || '';
const HTTPPORT = Number.parseInt(process.env['GOOI_HTTP_PORT']||'8080', 10);
const FILES_DIRNAME = process.env['GOOI_FILES_DIR'] || "files";
if (HTTPHOST === '') {
	throw new Error("GOOI_HTTP_HOST env var can't be empty");
}

const HOURS_RETENTION = Number.parseInt(process.env['GOOI_HOURS_RETENTION']||'24', 10);

try {
	fs.mkdirSync(FILES_DIRNAME, {recursive: true});
} catch (e) {
	console.error(`Cannot create directory '${FILES_DIRNAME}': ${e}`);
	process.exit(1);
}

function genidcode(){
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

	const domainsize = Math.pow(256, 5);
	const targetsize = Math.pow(62, 6);
	const limit = domainsize - (domainsize % targetsize);

	let number;
	do {
		const bytes = crypto.randomBytes(5);  // 62^6 < 256^5, so large enough
		number = 0;  // 256^5 < 2^52, so fits in JS's double
		for (let i = 0; i < 5; i++) number = 256 * number + bytes[i];
	} while (number >= limit);  // ensure uniformity

	let code = "";
	for (let i = 0; i < 6; i++) {
		code += alphabet[number % 62];
		number = Math.floor(number / 62);
	}
	return code;
}

if (HOURS_RETENTION > 0) {
	setInterval(() => {
		const dirlist = fs.readdirSync(FILES_DIRNAME);
		const nowtime = new Date().getTime();
		let count = 0;

		for (const file of dirlist) {
			if (file.slice(-6) === "-fname") continue;
			const path = `${FILES_DIRNAME}/${file}`;
			try {
				const stats = fs.statSync(path);
				if (!stats.isFile()) continue;
				if (nowtime-stats.mtime.getTime() > HOURS_RETENTION*3600*1000) {
					fs.unlinkSync(path);
					fs.unlinkSync(path + "-fname");
					count++;
				}
			} catch (e) {
				console.error(`[cleanup] Couldn't process '${path}': ${e.message}`);
			}
		}

		if (count > 0) console.log(`[cleanup] Removed ${count} file(s)`);
	}, 3600*1000); //every hour
}

const idMiddleware = function(req, res, next) {
	const id = req.params.id.replace(/[^0-9a-z]/gi, "").substr(0, 10);
	if (!fs.existsSync(`${FILES_DIRNAME}/${id}`) || !fs.existsSync(`${FILES_DIRNAME}/${id}-fname`)) {
		res.writeHead(404);
		res.end("404 not found");
		return;
	}

	req.id = id;
	next();
}

app.post("/gooi/:fname", (req, res) => {
	const fname = req.params.fname.replace(/[\0-\x1f\x7f-\xff\/"\\]/g, "");
	if (fname.length === 0) {
		res.writeHead(400);
		res.end("Invalid filename given");
		return;
	}

	let id, fd, id_file_write_error;
	// If we don't succeed in 10 tries, let's report failure
	for (let i = 0; i < 10; i++) {
		id = genidcode();
		try {
			fd = fs.openSync(`${FILES_DIRNAME}/${id}`, "wx");
			break;
		} catch (e) {
			id_file_write_error = e;
			id = fd = null;
			continue;
		}
	}

	if (fd == null) {
		console.log("ID/filewrite error!");
		console.log(id_file_write_error);
		res.writeHead(500);
		res.end("Could not open file to write to\n");
		return;
	}

	// Set to true if the request properly ends in the "end" event; if it
	// doesn't, we can clean up in the "close" event.
	let proper_finish = false;

	function cleanup() {
		try { fs.closeSync(fd); } catch (e) {}
		try { fs.unlinkSync(`${FILES_DIRNAME}/${id}`); } catch (e) {}
	}

	const stream = fs.createWriteStream(null, { fd });
	req.pipe(stream);
	req.on("end", function() {
		fs.writeFileSync(`${FILES_DIRNAME}/${id}-fname`, fname);
		proper_finish = true;
		res.writeHead(200);
		res.end(`https://${HTTPHOST}/vang/${id}/${encodeURIComponent(fname)}\n`);
	});
	req.on("error", function(e) {
		console.error(e);
		cleanup();
		res.writeHead(500);
		res.end("Error while writing file\n");
	});
	req.on("close", function() {
		if (!proper_finish) {
			cleanup();
		}
	});
});

app.get("/vang/:id", idMiddleware, (req, res) => {
	const fname = fs.readFileSync(`${FILES_DIRNAME}/${req.id}-fname`).toString();
	res.redirect(301, `/vang/${req.id}/${encodeURIComponent(fname)}`);
});

app.get("/vang/:id/:fname", idMiddleware, (req, res) => {
	let stats = null;
	const datafname = `${FILES_DIRNAME}/${req.id}`;
	try {
		stats = fs.statSync(datafname);
	} catch (e) {
		console.error(e);
		res.writeHead(500);
		res.end("Could not open file\n");
		return;
	}

	getMime(req.params.fname, datafname).then(function(mime) {
		if (!mime) mime = "application/unknown";

		res.writeHead(200, {
			"Content-Length": stats.size.toString(),
			"Content-Type": `${mime}; charset=utf-8`,
			"Accept-Ranges": "bytes",
			"Cache-Control": "public, max-age=5184000, immutable",
		});

		fs.createReadStream(datafname).pipe(res);
		res.on("error", function(e) {
			console.error(e);
		});
	});
});

app.post("/houvast/:id", idMiddleware, (req, res) => {
	try {
		const fd = fs.openSync(`${FILES_DIRNAME}/${req.id}`, "a");
		const now = new Date();
		fs.futimesSync(fd, now, now);
		fs.closeSync(fd);
	} catch (e) {
		console.error(e);
		res.writeHead(500);
		res.end("Could not open file\n");
		return;
	}
	res.writeHead(200);
	res.end("200 ok");
});

const server = httpServer.listen(HTTPPORT, () => {
	console.log(`Server listening on ${server.address().address}:${HTTPPORT}`);
	console.log(`Configured with host name ${HTTPHOST}`);
});
