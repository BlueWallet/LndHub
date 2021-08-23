process.on('uncaughtException', function (err) {
  console.error(err);
  console.log('Node NOT Exiting...');
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
let express = require('express');
const helmet = require('helmet');
let morgan = require('morgan');
import { v4 as uuidv4 } from 'uuid';
let logger = require('./utils/logger');
const config = require('./config');

morgan.token('id', function getId(req) {
  return req.id;
});

let app = express();
app.enable('trust proxy');
app.use(helmet.hsts());
app.use(helmet.hidePoweredBy());

const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimit || 200,
});
app.use(limiter);

app.use(function (req, res, next) {
  req.id = uuidv4();
  next();
});

app.use(
  morgan(
    ':id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
  ),
);

let bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: false })); // parse application/x-www-form-urlencoded
app.use(bodyParser.json(null)); // parse application/json

app.use('/static', express.static('static'));
app.use(require('./controllers/api'));
app.use(require('./controllers/website'));

const bindHost = process.env.HOST || '0.0.0.0';
const bindPort = process.env.PORT || 3000;

let server = app.listen(bindPort, bindHost, function () {
  logger.log('BOOTING UP', 'Listening on ' + bindHost + ':' + bindPort);
});
module.exports = server;
