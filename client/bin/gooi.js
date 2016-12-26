#!/usr/bin/env node
"use strict";

const Gooi=require('../main.js'),
      toClipboard=require("to-clipboard");

const gooi = new Gooi("tomsmeding.com", 443, '/gooi/');

function stderr(/* strings */) {
	const args = Array.prototype.slice.call(arguments);
	process.stderr.write(args.join(' ') + '\n');
}

function usageandexit(code){
	stderr("Usage: gooi [-cqh] <file>");
	stderr("Uploads the given file and provides a handy, short-lived, shareable download link.");
	stderr("  -c  Copy the link to the clipboard");
	stderr("  -q  Only print the URL");
	stderr("  -h  Show this");
	process.exit(code);
}

let opts={};
let fnames=[];
for(let i=2;i<process.argv.length;i++){
	const arg=process.argv[i];
	if(arg[0]!='-'){
		fnames.push(arg);
		continue;
	}
	for(let j=1;j<arg.length;j++){
		if("chq".indexOf(arg[j])==-1){
			console.log(`Unrecognised flag '${arg[j]}'`);
			usageandexit(1);
		}
		opts[arg[j]]=true;
	}
}
if(opts.h)usageandexit(0);
if(fnames.length==0){
	console.log("No filename given!");
	usageandexit(1);
}

gooi.gooi(fnames, function (e, r) {
	if (e != null) {
		console.log('error while uploading:', e);
		return;
	}

	console.log(r);

	if(opts.c){
		toClipboard.sync(r.trim());
		if(!opts.q)stderr('(copied)');
	}
});
