var ursa = require("ursa");
var fs = require('fs');
var express = require('express');
var http = require('http');
var https = require('https');
var HTTPS_PORT = 443;
var localSecureApp = express();
var localApp = express();
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var favicon = require('static-favicon');
var header = '-----BEGIN PUBLIC KEY-----\n';
var ending = '\n-----END PUBLIC KEY-----\n';
var cors = require('cors');
var colores = require('colors');
var async = require('async');
var redis = require("redis"),
redisClient = redis.createClient();
var crypto = require('crypto');
var TTL = 5 * 60;

var Gpio = require('onoff').Gpio;
var sendgrid  = require('sendgrid')('catena', 'catena01');


var on = new Gpio(23,'out');
var off = new Gpio(24,'out');

var corsOptions = {
	origin: 'http://localhost:9000'
};

localSecureApp.use(favicon());
localSecureApp.use(bodyParser.json());
localSecureApp.use(bodyParser.urlencoded());
localSecureApp.use(cookieParser());
localSecureApp.use(cors());

var options = {
	key: fs.readFileSync('./keys-key.pem'),
	cert: fs.readFileSync('./keys-cert.pem')
};

var secureServer = https.createServer(options, localSecureApp);

secureServer.listen(HTTPS_PORT);

localSecureApp.get('/bon', security, function (req, res){
	on.writeSync(1);
	console.log('on pressed');
	setTimeout(function () {
		on.writeSync(0);
		console.log('on depressed');
	}, 1000);


	sendgrid.send({
		to:       'goofyahead@gmail.com',
		from:     'usage@catena.org',
		subject:  'Your device is in use',
		text:     'The device is on use and you have received the payment for its use.'
	}, function(err, json) {
		console.log('email sent');
		if (err) { 
			return console.error(err);
		}
		console.log(json);
	});

	res.send('B on');
});

localSecureApp.get('/boff', security, function (req, res){

	sendgrid.send({
		to:       'goofyahead@gmail.com',
		from:     'usage@catena.org',
		subject:  'Your device is free again',
		text:     'The device is ready for another user!'
	}, function(err, json) {
		if (err) { return console.error(err); }
		console.log(json);
	});

	off.writeSync(1); 
	console.log('off pressed');
	setTimeout(function () {
		off.writeSync(0);
		console.log('off depressed');
	}, 1000);

	res.send('B off');
});

function security (req,res, next) {
	var challenge = req.query.challenge;
	var user = req.query.user;

	redisClient.get('user_session_' + user, function (err, item) {
		if (item == challenge) {
			redisClient.get('key_' + user, function (err, item) {
				if (item == 1) {
					next();
				} else {
					res.send(403);
				}
			});
		}
		else res.send(403);
	});
}

localSecureApp.get('/keys', function (req,res) {
	var files = fs.readdirSync('./keys/');

	var signaturesArray = [];

	async.each(files, function (file, cb) {
		
		redisClient.get('key_' + file.split('.')[0], function (err, item) {
			console.log('status is ' + item);
			signaturesArray.push({user: file.split('.')[0], signature: 'asdfasdf', status: item});
			cb();
		});
	}, function (err){
		res.send(signaturesArray);
	});
	
});

localSecureApp.get('/keys/:key', function (req, res) {
	var key = req.params.key;
	var status = parseInt(req.query.status);

	redisClient.set('key_' + key, status, redis.print);

	res.send(200);
});


localSecureApp.post('/keys', function (req, res){

	var keyToAdd = req.body.key;
	var name = req.body.name;

	var pemKey = header + keyToAdd + ending;

	var ursaKey = ursa.createPublicKey(new Buffer(pemKey), ursa.BASE64);

	fs.writeFileSync('./keys/' + name + '.pub', ursaKey.toPublicPem());

	console.log(ursaKey.toPublicPem().toString());

	redisClient.set('key_' + name, -1, redis.print);

	res.send(200, {message : "everything is ok"});
});

localSecureApp.get('/challenge/:user', function (req, res) {
	var name = req.params.user;

	var session = crypto.randomBytes(12).toString('hex').toString().toUpperCase();

	console.log("session generated" + session);

	redisClient.setex('user_session_' + name, TTL, session, redis.print);

	console.log(fs.readFileSync(__dirname + '/keys/' + name + '.pub'));

	var keyFromFile = ursa.createPublicKey(fs.readFileSync(__dirname + '/keys/' + name + '.pub'));
	
	var challenge = keyFromFile.encrypt(session , ursa.BASE64, ursa.BASE64, ursa.RSA_PKCS1_PADDING);
	
	console.log(challenge.toString('BASE64'));

	res.send(challenge.toString('BASE64'));
});





