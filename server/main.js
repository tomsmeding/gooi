#!/usr/bin/env node
"use strict";

const fs=require("fs"),
      http=require("http"),
      bodyParser=require("body-parser"),
      app=require("express")(),
      mkdirp=require("mkdirp"),
      httpServer=http.Server(app);

const HTTPHOST="tomsmeding.com";
const HTTPPORT=11056;
const FILES_DIRNAME="files";

const uniqid=()=>{
	let i=0;
	return ()=>i=(i+1)%4294967291; //last prime under 2^32
}();

mkdirp.sync(FILES_DIRNAME);

let startid;
try {
	startid=+fs.readFileSync(`${FILES_DIRNAME}/startid`);
	if(isNaN(startid)||startId<0)throw 0;
} catch(_){
	startid=42424242;
}
const genidcode=()=>{
	let i=startid;
	return ()=>{
		const code=`0000000${(i*42%4294967291).toString(36)}`.slice(-7);
		//(x -> nx) : F_p -> F_p with p prime and 0<n<x is a bijection
		i++;
		fs.writeFileSync(`${FILES_DIRNAME}/startid`,i.toString());
		let res="";
		for(let j=0;j<7;j++)res+=code[2*j%7]; //same goes here
		return res;
	}
}();

setInterval(()=>{
	const dirlist=fs.readdirSync(FILES_DIRNAME);
	const nowtime=new Date().getTime();
	for(let file of dirlist){
		const path=`${FILES_DIRNAME}/${file}`;
		const stats=fs.statSync(path);
		if(!stats.isFile())continue;
		if(nowtime-stats.mtime.getTime()>3600*1000){ //1 hour storage
			fs.unlinkSync(path);
		}
	}
},3600*1000); //every hour

app.use(bodyParser.raw({"type":"*/*"}));

app.post("/gooi/:fname",(req,res)=>{
	const fname=req.params.fname.replace(/[\0-\x1f\x7f-\xff\/]/g,"");
	if(fname.length==0){
		res.writeHead(400);
		res.end("Invalid filename given");
		return;
	}
	const id=genidcode();
	try {
		fs.writeFileSync(`${FILES_DIRNAME}/${id}`,req.body);
		fs.writeFileSync(`${FILES_DIRNAME}/${id}-fname`,fname);
	} catch(e){
		console.log(e);
		res.writeHead(500);
		res.end();
		return;
	}
	res.writeHead(200);
	res.end(`http://${HTTPHOST}:${HTTPPORT}/vang/${id}\n`);
});

app.get("/vang/:id",(req,res)=>{
	const id=req.params.id.replace(/[^0-9a-z]/g,"").substr(0,10);
	if(!fs.existsSync(`${FILES_DIRNAME}/${id}`)||!fs.existsSync(`${FILES_DIRNAME}/${id}-fname`)){
		res.writeHead(404);
		res.end();
		return;
	}
	const fname=fs.readFileSync(`${FILES_DIRNAME}/${id}-fname`).toString();
	const fnamequo=`"${fname.replace(/([\\"])/g,"\\$1")}"`
	res.writeHead(200,{
		"Content-Type":"application/octet-stream",
		"Content-Disposition":`attachment; filename=${fnamequo}`
	});
	res.end(fs.readFileSync(`${FILES_DIRNAME}/${id}`));
});

let server=httpServer.listen(HTTPPORT,()=>{
	console.log(`Server listening on ${server.address().address}:${HTTPPORT}`);
	console.log(`Configured with host name ${HTTPHOST}`);
});
