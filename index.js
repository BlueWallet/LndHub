process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
let express = require('express');
let morgan = require('morgan');
let uuid = require('node-uuid');
let logger = require('./utils/logger');

morgan.token('id', function getId(req) {
  return req.id;
});

let app = express();

app.use(function(req, res, next) {
  req.id = uuid.v4();
  next();
});

app.use(
  morgan(
    ':id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
  ),
);

app.set('trust proxy', 'loopback');

let bodyParser = require('body-parser');
let config = require('./config');

app.use(bodyParser.urlencoded({ extended: false })); // parse application/x-www-form-urlencoded
app.use(bodyParser.json(null)); // parse application/json

app.use(require('./controllers/api'));
app.use(require('./controllers/website'));

let server = app.listen(process.env.PORT || 3000, function() {
  logger.log('BOOTING UP', 'Listening on port ' + (process.env.PORT || 3000));
});
module.exports = server;
