#!/usr/bin/env node
"use strict";

const http=require("http"),
      fs=require("fs"),
      toClipboard=require("to-clipboard");

const HTTPHOST="tomsmeding.com",
      HTTPPORT=11056;

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
		if("chq".indexOf(arg[j])==-1){
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

const safefname=fname.replace(/^.*\//,"").replace(/[\0-\x1f\x7f-\xff]/g,"?");

let filedesc=null;
try {
	filedesc=fs.openSync(fname,"r");
} catch(e){
	console.log(`Error while opening file: ${e.message}`);
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
		"Tranfer-Encoding":"chunked"
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
		if(success && opts.c){
			toClipboard.sync(bodytext.trim());
			if(!opts.q)stderr('(copied)');
		}
	});
});
req.on("error",(e)=>{
	console.log(`Upload threw an error: ${e.message}`);
	process.exit(1);
});

let buf=new Buffer(4096);
function writechunk(){
	const nread=fs.readSync(filedesc,buf,0,4096,null);
	if(nread==4096)req.write(buf,writechunk);
	else if(nread>0)req.write(buf.slice(0,nread),writechunk);
	else req.end();
}
writechunk();
