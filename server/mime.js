const fs = require("fs/promises");
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

async function validUTF8HeadFile(fname) {
	try {
		const fh = await fs.open(fname, "r");
		const buffer = Buffer.alloc(4096);
		await fh.read(buffer, 0, buffer.length, 0);

		// Don't await the close, let it finish in its own time
		fh.close().catch(function(err) {
			console.error(err);
		});

		return validUTF8Head(buffer);
	} catch (err) {
		console.error(err);
		return null;
	}
}

async function getMime(filename, datafname) {
	const mime = Mime.getType(filename);
	if (mime != null) {
		return mime;
	}

	try {
		const res = await FileType.fromFile(datafname);
		if (res) return res.mime;
	} catch (err) {
		console.error(err);
	}

	const valid = await validUTF8HeadFile(datafname);
	if (valid) return "text/plain";
	else return null;
};

module.exports = getMime;
