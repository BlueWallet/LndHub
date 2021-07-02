import { User, Lock, Paym, Invo } from '../../class';
import Frisbee from 'frisbee';
import { getCipherInfo } from 'crypto';
// import { send } from 'process';
const config = require('../../config');
const adminConfig = require('./adminConfig');
let express = require('express');
let router = express.Router();
let logger = require('../../utils/logger');

// const { exec } = require('child_process')

const fs = require('fs');
const mustache = require('mustache');

let adminPath = adminConfig.adminUIPath
let adminUserName = adminConfig.adminUserName
let adminPin = adminConfig.adminPin;
logger.log('ADMIN using config', JSON.stringify(adminConfig));

var path = require('path')
let loadPath = path.join(__dirname, 'public')
router.use(`${adminPath}`, express.static(loadPath))
router.use(express.static('../../static'))

var Redis = require('ioredis');
var redis = new Redis(config.redis);
redis.monitor(function (err, monitor) {
  monitor.on('monitor', function (time, args, source, database) {
    // console.log('REDIS', JSON.stringify(args));
  });
});

let lightning = require('../../lightning');
let identity_pubkey = false;

/****** ADMIN EXTENSION INDEX ******/
/****** IMPORT TEMPLATES ******/
let indexTemplate = fs.readFileSync(`${loadPath}/indexTemplate.html`).toString('utf8');
/****** INDEX of path set adminPath in adminConfig.js  /******/
router.get(`${adminPath}`, async function (req, res) { // REWISIT FIX AUTH = some else then adminPin
  logger.log(`${adminPath}`, [req.id]);
  res.setHeader('Content-Type', 'text/html');
  if (authAdmin(req.headers.authorization)) {
    // console.log('**************** AUTHORRIZATED ****************')
    return res.send(comp_meny);
  }
  return res.send(indexRendered);
});

/** HONEYPOT */
router.get('/admin', async function (req, res) {
  logger.log('/admin', [req.id]);
  let reply = ` Hey Yo wzup - if You do not know Your way around here ? ... then You do not know Your way around here ! `;
  res.send(reply);
});
/****** END ADMIN INDEX /*******/

/****** COMPONENT DYNAMIC FEES API URL/get/set ******/
/****** FORWARD + INTRA FEES / MUSTACHE RENDERED ******/
let indexRendered = mustache.render(indexTemplate, { head: adminUserName });
let comp_meny = fs.readFileSync(`${loadPath}/comp_meny.html`).toString('utf8');
let comp_feeSetting = fs.readFileSync(`${loadPath}/comp_feeSetting.html`).toString('utf8');

/** */
router.get(`${adminPath}/feesettings/getfees`, async function (req, res) {
  logger.log('/settings/getfees', [req.id]);

  if (authAdmin(req.headers.authorization)) {
    // logger.log('**************** AUTHED ****************', ['OK'])
    let ffeep = (forwardFee * 100).toFixed(2)
    let ifeep = (internalFee * 100).toFixed(2)
    let viuw = { forwardFee: forwardFee, internalFee: internalFee, ffeep: ffeep, ifeep: ifeep }
    let hubFees = `{
                "forwardFee": "${forwardFee}", 
                "internalFee": "${internalFee}"
                }`;
    logger.log(`${adminPath}/feesettings/getfees`, hubFees);
    let ren = mustache.render(comp_feeSetting, viuw)
    // console.log(ren)
    return res.status(200).send(ren);
  }
});

/** */
router.post(`${adminPath}/feesettings/setfees`, async function (req, res) { // REVISIT
  logger.log('/settings/setfees', [req.id]);

  let newInternalFee = req.body.internalFee; // TODO: ADD validate and check sanity of fee
  let newForwardFee = req.body.forwardFee;
  // console.log(req.body)
  // console.log(newInternalFee, newForwardFee)

  if (authAdmin(req.headers.authorization)) {
    let internalFeeCurrent = internalFee;
    let forwardFeeCurrent = forwardFee;
    await setFees(newInternalFee, newForwardFee); // called here to set redis "read only" _forwardFee field
    logger.log(`/feesettings/setfees : forwardFee: ${forwardFeeCurrent}, now changed to ${forwardFee}`, ['OK']);
    logger.log(`/feesettings/setfees : internalFee: ${internalFeeCurrent}, now changed to ${internalFee}`, ['OK']);
  } else {
    logger.log(`/feesettings/setfees : failed ERR AUTH FAILED`, ['ERR']);
  }
  res.setHeader('Content-Type', 'application/json');
  return res.send(`{ "forwardFee": ${forwardFee}, "internalFee": ${internalFee} }`);
});
/****** END DYNAMIC FEES API URL/get/set ******/

module.exports = router;

// ** START DYNAMIC FEE SETTINGS FUNCTIONS * /
global.adminPin = config.adminPin;
/** global internalFee, forwardFee  are declared in LndHub/controllers/api.js from config.js*/

/** */
function authAdmin(authorization) {
  if (!authorization) return false;
  let access_token = authorization.replace('Bearer ', '');
  if (adminPin == access_token) {
    return true;
  }
  return false;
}

/** set fees function for runtime change of ForwardReserveFee ******/
async function setForwardReserveFee(incommingForwardFee) {
  forwardFee = incommingForwardFee;
  await redis.set('_forwardFee', forwardFee); // for UI "read only" reference
  logger.log('Config Fee ForwardReserveFee set ', forwardFee);
}
/** set fees function for runtime change of IntraHubFee */
async function setInternalHubFee(incommingInternalFee) {
  internalFee = incommingInternalFee;
  await redis.set('_internalFee', internalFee); // for UI "read only" reference
  logger.log('Config Fee IntraHubFee set ', internalFee);
}
/** set fees function for runtime change of fees */
async function setFees(incommingInternalFee, incommingForwardFee) {
  setInternalHubFee(incommingInternalFee)
  setForwardReserveFee(incommingForwardFee);
}
// ** END DYNAMIC FEE SETTINGS FUNCTIONS * /