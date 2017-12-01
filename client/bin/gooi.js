#!/usr/bin/env node
"use strict";

const Gooi=require('../main.js'),
      toClipboard=require("to-clipboard");

const gooi = new Gooi("tomsmeding.com", 443, '/vang/', '/gooi/');

function stderr(/* strings */) {
	const args = Array.prototype.slice.call(arguments);
	process.stderr.write(args.join(' ') + '\n');
}

function usageandexit(code){
	stderr("Usage: gooi [-h] ([-cqn] | vang) <file>");
	stderr("Uploads the given file and provides a handy, short-lived, shareable download link.");
	stderr("  -h         Show this");
	stderr("Options when gooi'ing:");
	stderr("  -c         Copy the link to the clipboard");
	stderr("  -q         Only print the URL");
	stderr("  -n <name>  Use the given name for the uploaded file instead of the default")
	process.exit(code);
}

let opts={};
let fnames=[];
let uploadFname=null;
let skipnextarg=false;
for(let i=2;i<process.argv.length;i++){
	if(skipnextarg){
		skipnextarg=false;
		continue;
	}
	const arg=process.argv[i];
	if(arg[0]!='-'){
		fnames.push(arg);
		continue;
	}
	for(let j=1;j<arg.length;j++){
		if("chnq".indexOf(arg[j])==-1){
			stderr(`Unrecognised flag '${arg[j]}'`);
			usageandexit(1);
		}
		if(arg[j]=="n"){
			if(i==process.argv.length-1){
				stderr("File name expected after '-n'");
				process.exit(1);
			}
			uploadFname=process.argv[i+1];
			skipnextarg=true;
		} else {
			opts[arg[j]]=true;
		}
	}
}
if(opts.h)usageandexit(0);
if(fnames.length==0){
	stderr("No filename given!");
	usageandexit(1);
}

if (fnames[0] === 'vang') {
	gooi.vang(fnames[1]).then(r => {
		r.pipe(process.stdout);
	}).catch(e => {
		stderr('error while downloading:', e);
	});
} else {
	gooi.gooi(fnames, {uploadFname: uploadFname}).then(r => {
		console.log(r);

		if(opts.c){
			toClipboard.sync(r.trim());
			if(!opts.q)stderr('(copied)');
		}
	}).catch(e => {
		stderr('error while uploading:', e);
	});
}
