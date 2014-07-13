var ursa = require("ursa");
var fs = require('fs');
var accountSid = 'AC0b488ea0c7b3e3cd4c698077cbf31c64'; 
var authToken = '231599f9c72806e6853b1f514e1e2e1f'; 
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
//require the Twilio module and create a REST client 
var twilioClient = require('twilio')(accountSid, authToken); 


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
localSecureApp.use(express.static(__dirname + '/public'));

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


	redisClient.get('admin_email', function (err, item) {
		if (item) {
			sendgrid.send({
				to:       item,
				from:     'usage@catena.org',
				subject:  'Your device is being used',
				text:     'Your device is on use, transaction has been correctly made.'
			}, function(err, json) {
				if (err) { return console.error(err); }
				console.log(json);
			});
		}
	});

	res.send('B on');
});

localSecureApp.get('/update/:amount', function (req, res) {
	var transaction = req.params.amount;
	redisClient.incrby('amount', transaction, redis.print);
	res.send(200);
});

localSecureApp.get('/stats', function (req, res) {

	redisClient.get('amount', function (err, item) {
		res.send({money : item});
	});
})

localSecureApp.get('/boff', security, function (req, res){

	redisClient.get('admin_email', function (err, item) {
		if (item) {
			sendgrid.send({
				to:       item,
				from:     'usage@catena.org',
				subject:  'Your device is free again',
				text:     'The device is ready for another user!'
			}, function(err, json) {
				if (err) { return console.error(err); }
				console.log(json);
			});
		}
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
					res.send(403, {message : "UNAUTHORIZE, request access"});
				}
			});
		}
		else res.send(403, {message : "UNAUTHORIZE, request access"});
	});
}

localSecureApp.get('/keys', function (req,res) {
	var files = fs.readdirSync('./keys/');

	var signaturesArray = [];

	async.each(files, function (file, cb) {
		
		redisClient.get('key_' + file.split('.')[0], function (err, item) {
			console.log('status is ' + item);
			if (file.split('.')[0] == "goofyahead") {
				signaturesArray.push({gravatar: "http://gravatar.com/avatar/cd351ae83b3a49c828bc6b4b5320844e?s=300",user: file.split('.')[0], signature: 'Abcs939df', status: parseInt(item)});
			} else {
				signaturesArray.push({gravatar: "http://www.gravatar.com/avatar/205e460b479e2e5b48aec07710c08d50?s=300",user: file.split('.')[0], signature: 'Abcs939df', status: parseInt(item)});
			}
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

localSecureApp.post('/admin', function (req, res){

	var phone = req.body.phone;
	var email = req.body.email;

	redisClient.set('admin_phone', phone, redis.print);
	redisClient.set('admin_email', email, redis.print);

});

localSecureApp.post('/keys', function (req, res){

	var keyToAdd = req.body.key;
	var name = req.body.name;

	var pemKey = header + keyToAdd + ending;

	var ursaKey = ursa.createPublicKey(new Buffer(pemKey), ursa.BASE64);

	fs.writeFileSync('./keys/' + name + '.pub', ursaKey.toPublicPem());

	console.log(ursaKey.toPublicPem().toString());

	redisClient.set('key_' + name, 0, redis.print);

	redisClient.get('admin_phone', function (err, item) {
		if (item) {
			twilioClient.messages.create({  
				from: "+14156914520",
				to: item,
				body: "Somebody wants to use your device, https://192.168.0.111/#/users"
			}, function(err, message) { 
				console.log(message.sid); 
			});
		}
	});

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





