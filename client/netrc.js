const fs = require('fs');

function parseNetrc(text) {
	const result = new Map();
	let current = null;

	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].match(/^\s*$/)) continue;
		const m = lines[i].match(/^\s*(\S+)\s+(.*)$/);
		if (!m) {
			console.error(`Unrecognised line in netrc at line ${i+1}`);
			process.exit(1);
		}

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
			default:
				console.error(`Unrecognised key in netrc at line ${i+1}`);
				process.exit(1);
		}
	}

	return result;
}

module.exports = function (config) {
	if (config.netrc == null) {
		return config;
	}

	const credentials = parseNetrc(fs.readFileSync(config.netrc).toString()).get(config.hostname);
	if (credentials != null) {
		config.auth = credentials.login + ":" + credentials.password;
	}
	delete config.netrc;

	return config;
}
