import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import logger from './utils/logger.js';
import config from './config.js';
import rateLimit from 'express-rate-limit';
import apiController from './controllers/api.js';
import siteController from './controllers/website.js';

process.on('uncaughtException', function (err) {
  console.error(err);
  console.log('Node NOT Exiting...');
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

morgan.token('id', function getId(req) {
  return req.id;
});

let app = express();
app.enable('trust proxy');
app.use(helmet.hsts());
app.use(helmet.hidePoweredBy());

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


app.use(express.urlencoded({ extended: false })); // parse application/x-www-form-urlencoded
app.use(express.json(null)); // parse application/json

app.use('/static', express.static('static'));
app.use(apiController);
app.use(siteController);

const bindHost = process.env.HOST || '0.0.0.0';
const bindPort = process.env.PORT || 3000;

let server = app.listen(bindPort, bindHost, function () {
  logger.log('BOOTING UP', 'Listening on ' + bindHost + ':' + bindPort);
});
module.exports = server;
