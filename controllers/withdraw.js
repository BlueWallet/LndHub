import { User, Widr } from '../class/';
let { bech32 } = require('bech32')

const config = require('../config');
const fs = require('fs');
const mustache = require('mustache');
const qr = require('qr-image');

let express = require('express');
let router = express.Router();
let logger = require('../utils/logger');

const withdrawPageRoute = "/withdraw/";
const withdrawPrimaryAPIRoute = "/lnurl-withdraw-primary/";
const withdrawSecondaryAPIRoute = "/lnurl-withdraw-secondary/";

var Redis = require('ioredis');
var redis = new Redis(config.redis);

router.post('/createwithdrawlink', async function (req, res) {
  logger.log('/createwithdrawlink', [req.id]);
  let u = new User(redis, bitcoinclient, lightning);
  if (!(await u.loadByAuthorization(req.headers.authorization))) {
    return errorBadAuth(res);
  }
  logger.log('/createwithdrawlink', [req.id, 'userid: ' + u.getUserId()]);

  if (!req.body.amt || /*stupid NaN*/ !(req.body.amt > 0)) return errorBadArguments(res);

  if (config.sunset) return errorSunsetAddInvoice(res);

  // todo check if user's balance is sufficient at this time
  const widr = new Widr(redis, req.body.amt, u.getUserId());
  try {
    let savedWidr = await widr.saveWithdrawal();
    let withdrawPageLink = req.protocol + "://" + req.headers.host + withdrawPageRoute + savedWidr.secret;
    let responsePayload = {
      lnurl: getLNURLFromSecret(req, savedWidr.secret),
      withdrawPage: withdrawPageLink
    }
    res.send(responsePayload);
  } catch (Err) {
    logger.log('', [req.id, 'error creating withdraw link:', Err.message, 'userid:', u.getUserId()]);
    return errorGeneralServerError(res);
  }
});

router.get('/withdraw/:secret', async function (req, res) {
  logger.log('/withdraw', [req.id]);
  res.setHeader('Content-Type', 'text/html');
  try {
  let wd = await new Widr(redis).lookUpWithdrawal(req.params.secret);
  if (!wd) {
    let html = fs.readFileSync('./templates/withdraw404.html').toString('utf8');
    return res.status(404).send(html)
  }
  let html = fs.readFileSync('./templates/withdraw.html').toString('utf8');
  let parsedWd = JSON.parse(wd);
  return res.status(200).send(mustache.render(html, Object.assign({}, {amount: parsedWd.amount ,lnurl: getLNURLFromSecret(req, parsedWd.secret)})));
  } catch(Err) {
    return res.status(500).send(Err.message)
  }
});

router.get('/withdrawqr/:lnurl', function (req, res) {
  var code = qr.image(req.params.lnurl, { type: 'png' });
  res.setHeader('Content-type', 'image/png');
  code.pipe(res);
});

function getLNURLFromSecret(req, secret) {
	let withdrawAPILink = req.protocol + "://" + req.headers.host + withdrawPrimaryAPIRoute + secret;
	let words = bech32.toWords(Buffer.from(withdrawAPILink, 'utf8'));
	return bech32.encode("lnurl", words, 1023);
}

module.exports = router;