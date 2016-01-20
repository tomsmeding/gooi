#!/usr/bin/env node
"use strict";

if(process.argv.length!=3){
	console.log("Pass the name of the file to throw as a command-line parameter");
	process.exit();
}

const http=require("http"),
      fs=require("fs");

const HTTPHOST="tomsmeding.com",
      HTTPPORT=11056;

const fname=process.argv[2],
      safefname=fname.replace(/[\0-\x1f\x7f-\xff\/]/g,"?");

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
	if(res.statusCode!=200)console.log(`Couldn't upload: ${res.statusCode}`);
	res.setEncoding("utf8");
	res.on("data",(data)=>process.stdout.write(data));
	res.on("end",()=>process.exit(0));
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
