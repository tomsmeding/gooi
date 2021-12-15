#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const app = require("express")();
const httpServer = http.Server(app);
const getMime = require('./mime.js');

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

function hashFile(path, cb) {
	try {
		const hash = crypto.createHash("sha256");
		const stream = fs.createReadStream(path);
		stream.on("data", data => hash.update(data));
		stream.on("close", () => cb(hash.digest(), null));
		stream.on("error", e => cb(null, e));
	} catch (e) {
		cb(null, e);
	}
}

// sha256 digest in base64 => fileid
// Maps hashes to the most recent file whose contents match the hash. Used for
// deduplication. The digests are base64-encoded so that comparison is
// value-based instead of pointer-based.
const hashmap = new Map();

function initialiseHashmap() {
	let successCount = 0;
	let queueLength = 0;
	let mtimeCache = new Map();

	for (const file of fs.readdirSync(FILES_DIRNAME)) {
		if (file.slice(-6) === "-fname") continue;
		const path = `${FILES_DIRNAME}/${file}`;

		// Careful to stat the -fname file here, since the data file may be
		// hardlinked to another.
		const stats = fs.statSync(path + "-fname");
		if (!stats.isFile()) continue;
		const current_mtime = stats.mtime.getTime();
		mtimeCache.set(file, current_mtime);

		queueLength++;
		hashFile(path, (digest, err) => {
			if (err) {
				console.error(`[hash] Error in reading '${path}': ${e.message}`);
			} else {
				// Convert to base64 beforehand so that comparison is
				// value-based instead of pointer-based.
				digest = digest.toString("base64");
				// console.log("[hash]", digest, file);
				if (!hashmap.has(digest) || current_mtime > mtimeCache.get(hashmap.get(digest))) {
					// if (hashmap.has(digest)) console.log("[hash] -> overwrote", hashmap.get(digest));
					hashmap.set(digest, file);
				}
				successCount++;
			}

			queueLength--;
			if (queueLength == 0) {
				console.log(`[hash] Hashed ${successCount} files successfully`);
			}
		});
	}
}

initialiseHashmap();

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

function dedupNewFile(fileid) {
	hashFile(`${FILES_DIRNAME}/${fileid}`, (digest, err) => {
		if (err) {
			console.log(`[dedup] Error hashing newly uploaded file: ${err}`);
			return;
		}

		digest = digest.toString("base64");
		const orig_fileid = hashmap.get(digest);
		if (orig_fileid != null) {
			// We've uploaded a file that already existed. Let's hard-link this
			// file to the old one.
			const oldpath = `${FILES_DIRNAME}/${orig_fileid}`;
			const newpath = `${FILES_DIRNAME}/${fileid}`;

			// We need to do this sequence of actions atomically, to ensure
			// that we don't try to concurrently access the new file while
			// we're in the process of replacing it by a link. Furthermore we
			// need to be careful in case anything goes wrong.
			try {
				fs.renameSync(newpath, newpath + "-linkbak");
			} catch (e) {
				console.log(`[dedup] Failed to rename ${fileid} to linkbak: ${e}`);
				return;
			}

			try {
				fs.linkSync(oldpath, newpath);
			} catch (e) {
				console.log(`[dedup] Failed to link ${orig_fileid} to ${fileid}: ${e}`);
				try {
					fs.renameSync(newpath + "-linkbak", newpath);
				} catch (e) {
					console.log(`[dedup] LOST FILE! Failed to rename back after failed link of ${fileid}.`);
					// Remove everything we can find for this fileid
					try { fs.unlinkSync(newpath); } catch (e) {}
					try { fs.unlinkSync(newpath + "-linkbak"); } catch (e) {}
					try { fs.unlinkSync(newpath + "-fname"); } catch (e) {}
				}
				return;
			}

			try {
				fs.unlinkSync(newpath + "-linkbak");
			} catch (e) {
				console.log(`[dedup] Failed to remove ${fileid}-linkbak: ${e}`);
				return;
			}

			console.log(`[dedup] Successfully hardlinked ${fileid} to ${orig_fileid}`);
		}

		// Add the uploaded file to the hashmap, regardless of whether it was a
		// duplicate or not. It it was a duplicate, this overwrites any
		// existing entry, which ensures that the hashmap always contains the
		// newest entry.
		hashmap.set(digest, fileid);
	});
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
				// Careful to stat the -fname file here, since the data file
				// may be hardlinked to another.
				const stats = fs.statSync(path + "-fname");
				if (!stats.isFile()) continue;
				if (nowtime - stats.mtime.getTime() > HOURS_RETENTION*3600*1000) {
					// console.log(`[cleanup] Removing ${file}`);
					count++;

					hashFile(path, (digest, err) => {
						if (err) {
							console.log(`[cleanup] Error hashing ${file}, not deleting: ${err}`);
							return;
						}
						digest = digest.toString("base64");
						if (hashmap.get(digest) == file) hashmap.delete(digest);
						fs.unlinkSync(path);
						fs.unlinkSync(path + "-fname");
					});
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
		console.log("ID/file write error!");
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

		dedupNewFile(id);
	});
	req.on("error", function(e) {
		console.error(e);
		cleanup();
		res.writeHead(500);
		res.end("Error while receiving file\n");
	});
	req.on("close", function() {
		if (!proper_finish) {
			cleanup();
		}
	});
});

app.get("/vang/:id", idMiddleware, (req, res) => {
	const fname = fs.readFileSync(`${FILES_DIRNAME}/${req.id}-fname`).toString();
	res.redirect(302, `/vang/${req.id}/${encodeURIComponent(fname)}`);
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
		});

		fs.createReadStream(datafname).pipe(res);
		res.on("error", function(e) {
			console.error(e);
		});
	});
});

app.post("/houvast/:id", idMiddleware, (req, res) => {
	try {
		const fd = fs.openSync(`${FILES_DIRNAME}/${req.id}-fname`, "a");
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
