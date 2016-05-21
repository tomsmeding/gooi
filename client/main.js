const http=require("http");
const fs=require("fs");

module.exports = class Gooi {
	constructor(hostname, port, prefix) {
		this.hostname = hostname;
		this.port = port;
		this.prefix = prefix;
	}

	gooi(fname, callback) {
		const self = this
		const safefname=fname.replace(/^.*\//,"").replace(/[\0-\x1f\x7f-\xff]/g,"?");

		let filedesc=null;
		fs.open(fname, 'r', function (err, filedesc) {
			if (err != null) {
				callback(err, null);
				return;
			}

			let req=http.request({
				protocol:"http:",
				hostname:self.hostname,
				port:self.port,
				method:"POST",
				path:`${self.prefix}${encodeURIComponent(safefname)}`,
				headers:{
					"Content-Type":"application/octet-stream",
					"Tranfer-Encoding":"chunked"
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
					if (success) callback(null, bodytext.trim());
				});
			});
			req.on("error",(e)=>{
				callback(e, null);
			});

			let buf=new Buffer(4096);
			function writechunk(){
				const nread=fs.readSync(filedesc,buf,0,4096,null);
				if(nread==4096)req.write(buf,writechunk);
				else if(nread>0)req.write(buf.slice(0,nread),writechunk);
				else req.end();
			}
			writechunk();
		})
	}

	vang(id, callback) {
		// TODO
	}
}
