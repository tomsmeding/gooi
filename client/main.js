"use strict";

const http=require("http");
const fs=require("fs");
const path=require("path");
const util=require("util");
const yazl=require("yazl");

function upload(gooi,stream,filename,callback){
	let req=http.request({
		protocol:"http:",
		hostname:gooi.hostname,
		port:gooi.port,
		method:"POST",
		path:`${gooi.prefix}${encodeURIComponent(filename)}`,
		headers:{
			"Content-Type":"application/octet-stream",
			"Transfer-Encoding":"chunked"
		}
	},(res)=>{
		const success=res.statusCode==200;
		if(!success)callback(res, null);
		res.setEncoding("utf8");
		let bodytext="";
		res.on("data",(data)=>{
			if(success)bodytext+=data;
		});
		res.on("end",()=>{
			if(success)callback(null, bodytext.trim());
		});
	});
	req.on("error",(e)=>{
		callback(e, null);
	});

	stream.pipe(req);
}

function enumerateFiles(fnames){
	let res=[];
	for(let file of fnames){
		if(!Array.isArray(file)){
			file=[file,path.basename(file)];
		}
		const base=path.basename(file[0]);
		const dir=path.dirname(file[0]);
		const stat=fs.statSync(file[0]);
		console.log(`enumerate: found ${util.inspect(file)}`);
		if(stat.isFile())res.push(file);
		else if(stat.isDirectory()){
			const items=fs.readdirSync(file[0])
			             .map((f)=>[file[0]+"/"+f,file[1]+"/"+f]);
			res=res.concat(enumerateFiles(items));
		}
	}
	return res.map((f)=>[path.normalize(f[0]),f[1]]);
}

function createZipStream(basename,fnames,cb){
	const zipfile=new yazl.ZipFile();
	for(let file of fnames){
		console.log(`Adding file '${file[1]}' -- '${file[0]}'`);
		zipfile.addFile(file[0],basename+"/"+file[1]);
	}
	process.nextTick(()=>{
		zipfile.end();
	});
	cb(zipfile.outputStream);
}

module.exports = class Gooi {
	constructor(hostname, port, prefix) {
		this.hostname = hostname;
		this.port = port;
		this.prefix = prefix;
	}

	gooi(fnames, callback) {
		const self = this;

		if(fnames.length==0){
			callback(new Error("No files to gooi"),null);
			return;
		}

		try {
			if(fnames.length!=1||!fs.statSync(fnames[0]).isFile()){
				const zipbase=new Date().getTime().toString();
				const zipname=zipbase+".zip";
				const enumf=enumerateFiles(fnames);
				createZipStream(zipbase,enumf,(stream)=>upload(this,stream,zipname,callback));
			} else {
				const safefname=fnames[0].replace(/^.*\//,"").replace(/[\0-\x1f\x7f-\xff]/g,"?");
				upload(this,fs.createReadStream(fnames[0]),safefname,callback);
			}
		} catch(e){
			callback(e,null);
			return;
		}
	}

	vang(id, callback) {
		// TODO
	}
}
