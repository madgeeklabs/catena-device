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

var Gpio = require('onoff').Gpio;

var on = new Gpio(23,'out');
var off = new Gpio(24,'out');

var corsOptions = {
  origin: 'http://localhost:9000'
};

localSecureApp.use(favicon());
localSecureApp.use(bodyParser.json());
localSecureApp.use(bodyParser.urlencoded());
localSecureApp.use(cookieParser());
localSecureApp.use(cors(corsOptions));

var options = {
	key: fs.readFileSync('./keys-key.pem'),
	cert: fs.readFileSync('./keys-cert.pem')
};

var secureServer = https.createServer(options, localSecureApp);
secureServer.listen(HTTPS_PORT);

localSecureApp.get('/', function (req, res){
	on.writeSync(1); // 1 = on, 0 = off :)
    on.writeSync(0);
	res.send('local hello world :D');
});