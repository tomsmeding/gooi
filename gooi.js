#!/usr/bin/env node
"use strict";

const http=require("http"),
      fs=require("fs"),
      toClipboard=require("to-clipboard");

const HTTPHOST="tomsmeding.com",
      HTTPPORT=11056;


function usageandexit(code){
	console.log("Usage: gooi [-ch] <file>");
	console.log("Uploads the given file and provides a handy, short-lived, shareable download link.");
	console.log("  -c  Copy the link to the clipboard");
	console.log("  -h  Show this");
	process.exit(code);
}

let opts={};
let fname;
for(let i=2;i<process.argv.length;i++){
	const arg=process.argv[i];
	if(arg[0]!='-'){
		if(!fname)fname=arg;
		else {
			console.log("Two files given on the command line; gooi doesn't support multiple-upload yet.");
			usageandexit(1);
		}
		continue;
	}
	for(let j=1;j<arg.length;j++){
		if("ch".indexOf(arg[j])==-1){
			console.log(`Unrecognised flag '${arg[j]}'`);
			usageandexit(1);
		}
		opts[arg[j]]=true;
	}
}
if(opts.h)usageandexit(0);
if(!fname){
	console.log("No filename given!");
	usageandexit(1);
}

const safefname=fname.replace(/[\0-\x1f\x7f-\xff\/]/g,"?");

let filecontents;
try {
	filecontents=fs.readFileSync(fname);
} catch(e){
	console.log(`Error while reading file: ${e.message}`);
	process.exit(1);
}

let req=http.request({
	protocol:"http:",
	hostname:HTTPHOST,
	port:HTTPPORT,
	method:"POST",
	path:`/gooi/${encodeURIComponent(safefname)}`,
	headers:{
		"Content-Type":"application/octet-stream",
		"Content-Length":filecontents.length
	}
},(res)=>{
	const success=res.statusCode==200;
	if(!success)console.log(`Couldn't upload: ${res.statusCode}`);
	res.setEncoding("utf8");
	let bodytext="";
	res.on("data",(data)=>{
		if(success)bodytext+=data;
		process.stdout.write(data)
	});
	res.on("end",()=>{
		if(success){
			toClipboard.sync(bodytext.trim());
			console.log("(copied)");
		}
	});
});
req.on("error",(e)=>{
	console.log(`Request threw an error: ${e.message}`);
	process.exit(1);
});

try {
	req.write(filecontents);
} catch(e){
	console.log(`Error while writing file to stream: ${e.message}`);
	req.close();
	process.exit(1);
}
req.end();
