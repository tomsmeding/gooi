const fs = require("fs");
const FileType = require("file-type");
const Mime = require('mime');

// Returns true if the buffer can be the initial part of a valid utf-8 encoded string
function validUTF8Head(buf) {
	let state = 0;  // 0 = ascii, >0 = that number of 0b10... bytes remaining
	for (let i = 0; i < buf.length; i++) {
		if (state === 0) {
			if ((buf[i] & 0x80) === 0) continue;
			if ((buf[i] & 0xf8) === 0xf0) state = 3;
			else if ((buf[i] & 0xf0) === 0xe0) state = 2;
			else if ((buf[i] & 0xe0) === 0xc0) state = 1;
			else if ((buf[i] & 0x80) !== 0) return false;
		} else {
			if ((buf[i] & 0xc0) === 0x80) state--;
			else return false;
		}
	}
	return true;
}

function getMime(filename, datafname, cb) {
	const mime = Mime.getType(filename);
	if (mime != null) {
		cb(mime);
		return;
	}

	FileType.fromFile(datafname)
		.then(function(res) {
			if (res) cb(res.mime);
			else if (validUTF8Head(buffer)) cb("text/plain");
			else cb(null);
		})
		.catch(function(err) {
			console.error(err);
			if (validUTF8Head(buffer)) cb("text/plain");
			else cb(null);
		});
};

module.exports = getMime;
