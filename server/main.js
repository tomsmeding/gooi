#!/usr/bin/env node
"use strict";

const fs=require("fs");
const http=require("http");
const app=require("express")();
const mkdirp=require("mkdirp");
const httpServer=http.Server(app);
const getMime=require('./mime.js');

const HTTPHOST = process.env['GOOI_HTTP_HOST'] || '';
const HTTPPORT = Number.parseInt(process.env['GOOI_HTTP_PORT']||'8080', 10);
const FILES_DIRNAME = process.env['GOOI_FILES_DIR'] || "files";
if (HTTPHOST == '') {
	throw new Error("GOOI_HTTP_HOST env var can't be empty");
}

const HOURS_RETENTION = Number.parseInt(process.env['GOOI_HOURS_RETENTION']||'24', 10);

const uniqid=(()=>{
	let i=0;
	return ()=>i=(i+1)%4294967291; //last prime under 2^32
})();

mkdirp.sync(FILES_DIRNAME);

let startid;
try {
	startid=+fs.readFileSync(`${FILES_DIRNAME}/startid`);
	if(isNaN(startid)||startid<0)throw 0;
} catch(_){
	startid=42424242;
}
const genidcode=(()=>{
	let i=startid;
	return ()=>{
		const code=`0000000${(i*47%4294967291).toString(36)}`.slice(-7);
		//(x -> nx) : F_p -> F_p with p prime and 0<n<x is a bijection
		i++;
		fs.writeFileSync(`${FILES_DIRNAME}/startid`,i.toString());
		let res="";
		for(let j=0;j<7;j++)res+=code[2*j%7]; //same goes here
		return res;
	}
})();

if (HOURS_RETENTION > 0) {
	setInterval(()=>{
		const dirlist=fs.readdirSync(FILES_DIRNAME);
		const nowtime=new Date().getTime();
		for(let file of dirlist){
			if(file.slice(-6)=="-fname"||file=="startid")continue;
			const path=`${FILES_DIRNAME}/${file}`;
			try {
				const stats=fs.statSync(path);
				if(!stats.isFile())continue;
				if(nowtime-stats.mtime.getTime()>HOURS_RETENTION*3600*1000){
					fs.unlinkSync(path);
					fs.unlinkSync(path+"-fname");
				}
			} catch(e){
				console.log(`[cleanup] Couldn't process '${path}': ${e.message}`);
			}
		}
	},3600*1000); //every hour
}

const idMiddleware = function (req, res, next) {
	const id=req.params.id.replace(/[^0-9a-z]/g,"").substr(0,10);
	if(!fs.existsSync(`${FILES_DIRNAME}/${id}`)||!fs.existsSync(`${FILES_DIRNAME}/${id}-fname`)){
		res.writeHead(404);
		res.end("404 not found");
		return;
	}

	req.id = id;
	next();
}

app.post("/gooi/:fname",(req,res)=>{
	const fname=req.params.fname.replace(/[\0-\x1f\x7f-\xff\/"\\]/g,"");
	if(fname.length==0){
		res.writeHead(400);
		res.end("Invalid filename given");
		return;
	}
	const id=genidcode();

	let fd;
	try {fd=fs.openSync(`${FILES_DIRNAME}/${id}`,"w");}
	catch(e){
		console.log(e);
		res.writeHead(500);
		res.end("Could not open file to write to\n");
		return;
	}
	const stream=fs.createWriteStream(null,{fd: fd});
	req.pipe(stream);
	req.on("end",function(){
		fs.writeFileSync(`${FILES_DIRNAME}/${id}-fname`,fname);
		res.writeHead(200);
		res.end(`https://${HTTPHOST}/vang/${id}/${encodeURIComponent(fname)}\n`);
	});
	req.on("error",function(e){
		console.log(e);
		res.writeHead(500);
		res.end("Error while writing file\n");
		try {fs.closeSync(fd);} catch(e){}
	});
});

app.get("/vang/:id", idMiddleware, (req,res)=>{
	const fname=fs.readFileSync(`${FILES_DIRNAME}/${req.id}-fname`).toString();
	res.redirect(302, `/vang/${req.id}/${encodeURIComponent(fname)}`);
});

app.get("/vang/:id/:fname", idMiddleware, (req,res)=>{
	let filedesc=null;
	let stats=null;
	try {
		const datafname=`${FILES_DIRNAME}/${req.id}`;
		filedesc=fs.openSync(datafname,"r");
		stats=fs.statSync(datafname);
	} catch(e){
		console.log(e);
		res.writeHead(500);
		res.end("Could not open file\n");
		return;
	}

	const mime = getMime(filedesc) || 'application/unknown';
	res.writeHead(200,{
		"Content-Length":stats.size.toString(),
		"Content-Type":`${mime}; charset=utf-8`,
	});

	fs.createReadStream(null,{fd:filedesc}).pipe(res);
	res.on("error",function(e){
		console.log(e);
	});
});

app.post("/houvast/:id", idMiddleware, (req,res)=>{
	try {
		let fd=fs.openSync(`${FILES_DIRNAME}/${req.id}`,"a");
		const now=new Date();
		fs.futimesSync(fd,now,now);
		fs.closeSync(fd);
	} catch(e){
		console.log(e);
		res.writeHead(500);
		res.end("Could not open file\n");
		return;
	}
	res.writeHead(200);
	res.end("200 ok");
});

let server=httpServer.listen(HTTPPORT,()=>{
	console.log(`Server listening on ${server.address().address}:${HTTPPORT}`);
	console.log(`Configured with host name ${HTTPHOST}`);
});
