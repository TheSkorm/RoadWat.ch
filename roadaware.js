/*process.env.AWS_SECRET_KEY
 process.env.AWS_ACCESS_KEY_ID */

var http = require('http')

//Load node-static
var static = require('node-static');
var file = new static.Server("./static");

// Load simpledb
var simpledb = require('simpledb')
var sdb = new simpledb.SimpleDB({
	keyid : '',
	secret : ''
})
var DATABASE = 'roadawaredev';

//s3
var AWS = require('aws-sdk');
AWS.config.update({
	accessKeyId : '',
	secretAccessKey : '',
	region : 'ap-southeast-2'
});
var s3 = new AWS.S3();
//s3.client.createBucket({Bucket: 'roadaware'}, function() {});

// multipart forms
var multiparty = require('multiparty');
var util = require('util');

//filesystem access
var fs = require('fs');

//easyimg
var easyimg = require('easyimage');

//escaping
sanitize = require('validator').sanitize

//url lib
var url = require('url');

//http auth lib
var auth = require('http-auth')
var basic;
sdb.select("select * from roadawareusers", function(error, result, meta) {
	var authlist = []
	for (a in result) {
		authlist.push(result[a]["$ItemName"] + ":" + result[a].password);
	}
	basic = auth({
		authRealm : "Admin Area",
		authList : authlist
	});
});

// TODO
/*
* Region locking
* update interface (eg, who posted what) for users/passwords
* Password hashing
* Protection against submitting extra fields
* add filtering system
*/

// TODO Future mwheeler
/*
 * minify everything
 * remove callback hell
 *
 */

function uuid() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}


http.createServer(function(request, response) {

	path = url.parse(request.url).pathname;
	if (path == "/submit") {
		if (request.method == 'POST') {
			var form = new multiparty.Form();
			id = uuid();
			form.parse(request, function(err, fieldsa, files) {
				fields = fieldsa;
				if (fields == undefined) {
					response.end();
					return;
				}
				fields['id'] = id;
				fields['date'] = new Date().getTime();

				if ("photoup" in fields || ! isEmptyObject(files)) {
					srcid = "";
					if (fields["photoup"] != "") {

						srcid = "/tmp/" + id;
						fields["photoup"] = fields["photoup"].replace(/^data:image\/(png|jpeg);base64,/, "");
						require("fs").writeFile("/tmp/" + id, fields["photoup"], 'base64', resizeandupload(request, response, fields));
					} else if ("upload" in files) {

						srcid = files.upload.path;
						resizeandupload(request, response, fields);
					} else {

						upload(request, response, fields);
					}
				};

				//              break;
				//}

			});
			return;
		};
	} else if (path == "/adminsubmit") {
		basic.apply(request, response, function(username) {
			if (request.method == 'POST') {
				var form = new multiparty.Form();
				form.parse(request, function(err, fields, files) {
					if (fields == undefined) {
						response.end();
						return;
					} else if (!('id' in fields)) {

						response.end();
						return;
					} else {
						sdb.putItem(DATABASE, fields['id'], fields, function(error) {

							response.writeHead(302, {
								'Location' : '/map?id=' + fields['id'] + "&u=1"
							});
							response.end();
						});
					}

				});
			}
		});
	} else if (path == "/overlay") {
		sdb.select("select `id`, `transport`, `issue`, `desc`, `lat`, `lng`, `date`, `picture`, `resolution` from " + DATABASE + " where `date` > '" + (new Date().getTime() - 5184000000) + "'", function(error, result, meta) {
			response.writeHead(200, {
				'content-type' : 'application/json'
			});
			response.end(JSON.stringify(result));
		});
	} else if (path == "/overlay-admin") {
		basic.apply(request, response, function(username) {
			sdb.select("select * from " + DATABASE, function(error, result, meta) {
				response.writeHead(200, {
					'content-type' : 'application/json'
				});
				response.end(JSON.stringify(result));
			});
		});
	} else {
		if (path == "/map") {
			file.serveFile("map.html", 200, {}, request, response);
		} else if (path == "/mapa") {
			basic.apply(request, response, function(username) {
				file.serveFile("mapa.html", 200, {}, request, response);
			});
		} else if (path == "/table") {
			file.serveFile("table.html", 200, {}, request, response);
		} else {
			file.serve(request, response);
		}
	}

}).listen(8081, "0.0.0.0");

function resizeandupload(request, response, fields) {
	fields["photoup"] = 1;

	var failedresize = 0;

	easyimg.resize({
		src : srcid,
		dst : "/tmp/" + id + "t",
		width : 400
	}, function(err, image) {
		if (err == null) {
			fields['picture'] = "yes";
			fs.readFile("/tmp/" + id + "t", function(err, data) {
				s3.client.putObject({
					Bucket : 'roadaware',
					Key : id + "t",
					ContentType : 'image/jpeg',
					Body : new Buffer(data, 'binary')
				}, function(err, data) {
				});

			});
		} else {
			failedresize = 1;
			upload(request, response, fields);
		};

		if (failedresize == 0) {

			fs.readFile(srcid, function(err, data) {
				s3.client.putObject({
					Bucket : 'roadaware',
					Key : id,
					ContentType : 'image/jpeg',
					Body : new Buffer(data, 'binary')
				}, function(err, data) {
					upload(request, response, fields);
				});

			});

		};

	});
}

function upload(request, response, fields) {

	for (z in fields) {
		fields[z] = sanitize(fields[z]).escape().replace("!", "&#33;");
	}
	fields['lat'] = sanitize(fields['lat']).toFloat();
	fields['lng'] = sanitize(fields['lng']).toFloat();
	if (fields['lat'] != NaN && fields['lng'] != NaN) {
		sdb.putItem(DATABASE, id, fields, function(error) {

			response.writeHead(302, {

				'Location' : '/map?id=' + id + "&u=1"
			});
			response.end();
		});
	};
}

