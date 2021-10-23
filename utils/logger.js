/* + + + + + + + + + + + + + + + + + + + + +
* Logger
* -----------
* a winston instance wrapper
*
* Author: Michael Samonte
*
+ + + + + + + + + + + + + + + + + + + + + */
import * as fs from 'fs';
import { createLogger, format, transports } from 'winston';

/* + + + + + + + + + + + + + + + + + + + + +
// Start
+ + + + + + + + + + + + + + + + + + + + + */
const { combine, timestamp, printf } = format;
const logFormat = printf((info) => {
  return `${info.timestamp} : ${info.level}: [${info.label}] : ${info.message}`;
});
const logger = createLogger({
  level: 'info',
  format: combine(timestamp(), logFormat),
  transports: [
    new transports.Console({
      level: 'error',
    }),
    new transports.Console(),
  ],
});

/**
 * create logs folder if it does not exist
 */
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

function log(label, message) {
  logger.log({
    level: 'info',
    label: label,
    message: JSON.stringify(message),
  });
}

/**
 * TODO: we can do additional reporting here
 * @param {string} label group label
 * @param {string} message log message
 */
function error(label, message) {
  console.error(new Date(), label, message);
  logger.log({
    level: 'error',
    label: label,
    message: JSON.stringify(message),
  });
}

exports.log = log;
exports.error = error;
