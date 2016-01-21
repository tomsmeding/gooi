#!/usr/bin/env node
"use strict";

const fs=require("fs"),
      http=require("http"),
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

app.post("/gooi/:fname",(req,res)=>{
	const fname=req.params.fname.replace(/[\0-\x1f\x7f-\xff\/]/g,"");
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
	req.on("data",function(data){
		if(data instanceof Buffer)fs.writeSync(fd,data,0,data.length);
		else fs.writeSync(fs,data);
	});
	req.on("end",function(){
		fs.closeSync(fd);
		fs.writeFileSync(`${FILES_DIRNAME}/${id}-fname`,fname);
		res.writeHead(200);
		res.end(`http://${HTTPHOST}:${HTTPPORT}/vang/${id}\n`);
	});
	req.on("error",function(e){
		console.log(e);
		res.writeHead(500);
		res.end("Error while writing file\n");
		try {fs.closeSync(fd);} catch(e){}
	});
});

app.get("/vang/:id",(req,res)=>{
	const id=req.params.id.replace(/[^0-9a-z]/g,"").substr(0,10);
	if(!fs.existsSync(`${FILES_DIRNAME}/${id}`)||!fs.existsSync(`${FILES_DIRNAME}/${id}-fname`)){
		res.writeHead(404);
		res.end("404 not found");
		return;
	}
	const fname=fs.readFileSync(`${FILES_DIRNAME}/${id}-fname`).toString();
	const fnamequo=`"${fname.replace(/([\\"])/g,"\\$1")}"`

	let filedesc=null;
	try {
		filedesc=fs.openSync(`${FILES_DIRNAME}/${id}`,"r");
	} catch(e){
		console.log(e);
		res.writeHead(500);
		res.end("Could not open file\n");
		return;
	}
	res.writeHead(200,{
		"Content-Type":"application/octet-stream",
		"Content-Disposition":`attachment; filename=${fnamequo}`,
		"Transfer-Encoding":"chunked"
	});
	try {
		let buf=new Buffer(4096);
		while(true){
			const nread=fs.readSync(filedesc,buf,0,4096,null);
			if(nread==4096)res.write(buf);
			else if(nread>0)res.write(buf.slice(0,nread));
			else break;
		}
		res.end();
	} catch(e){
		console.log(e);
		res.close();
	}
});

let server=httpServer.listen(HTTPPORT,()=>{
	console.log(`Server listening on ${server.address().address}:${HTTPPORT}`);
	console.log(`Configured with host name ${HTTPHOST}`);
});
