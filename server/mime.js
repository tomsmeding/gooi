const fs = require("fs");
const fileType = require("file-type");

// Returns true if the buffer can be the initial part of a valid utf-8 encoded string
function validUTF8Head(buf) {
	let state = 0;  // 0 = ascii, >0 = that number of 0b10... bytes remaining
	for (let i = 0; i < buf.length; i++) {
		if (state == 0) {
			if ((buf[i] & 0x80) == 0) continue;
			if ((buf[i] & 0xf8) == 0xf0) state = 3;
			else if ((buf[i] & 0xf0) == 0xe0) state = 2;
			else if ((buf[i] & 0xe0) == 0xc0) state = 1;
			else if ((buf[i] & 0x80) != 0) return false;
		} else {
			if ((buf[i] & 0xc0) == 0x80) state--;
			else return false;
		}
	}
	return true;
}

function getMime(filedesc) {
	const buffer = Buffer.alloc(fileType.minimumBytes);

	try {
		fs.readSync(filedesc, buffer, 0, fileType.minimumBytes, 0);
	} catch (e) {
		console.log(e);
		return null;
	}

	const res = fileType(buffer);

	if (res) return res.mime;
	if (validUTF8Head(buffer)) return "text/plain";
	return null;
};

module.exports = getMime;
