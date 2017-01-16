"use strict";

const https=require("https");
const fs=require("fs");
const path=require("path");
const util=require("util");
const yazl=require("yazl");

function upload(gooi,stream,filename,callback){
	let req=https.request({
		protocol:"https:",
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
		zipfile.addFile(file[0],basename+"/"+file[1]);
	}
	process.nextTick(()=>{
		zipfile.end();
	});
	cb(zipfile.outputStream);
}

function makeFilenameSafe(fname){
	return fname.replace(/^.*\//,"").replace(/[\0-\x1f\x7f-\xff]/g,"?");
}

module.exports = class Gooi {
	constructor(hostname, port, prefix) {
		this.hostname = hostname;
		this.port = port;
		this.prefix = prefix;
	}

	gooi(fnames, params, callback) {
		if(callback==null){
			callback=params;
			params={};
		}

		if(fnames.length==0){
			callback(new Error("No files to gooi"),null);
			return;
		}

		try {
			if(fnames.length!=1||!fs.statSync(fnames[0]).isFile()){
				let zipname=params.uploadFname;
				if(zipname==null)zipname=new Date().getTime().toString()+".zip";
				else if(zipname.slice(zipname.length-4)!=".zip")zipname+=".zip";
				zipname=makeFilenameSafe(zipname);
				const zipbase=zipname.slice(0,zipname.length-4);
				const enumf=enumerateFiles(fnames);
				createZipStream(zipbase,enumf,(stream)=>upload(this,stream,zipname,callback));
			} else {
				if(params.uploadFname==null)params.uploadFname=fnames[0];
				upload(this,fs.createReadStream(fnames[0]),makeFilenameSafe(params.uploadFname),callback);
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
