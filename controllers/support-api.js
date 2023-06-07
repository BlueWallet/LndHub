const config = require('../config')
let express = require('express')
let router = express.Router()
let logger = require('../utils/logger')
const { createHash } = require('crypto')
const shared = require('../utils/shared')

let bitcoinclient = require('../bitcoin')
let lightning = require('../lightning')
import { User } from '../class/'
import { BigNumber } from 'bignumber.js'
const redis = shared.redis
if (!(redis)) logger.error('support-api', 'no redis access!')

// ######################## HELPERS ########################

const authenticateUser = (req, res, next) => {
    let token = ''

    const bearer = req.header('Authorization')
    if (bearer && bearer.startsWith('Bearer ')) {
        token = bearer.substring(7)
        token = createHash('sha256').update(token).digest('hex')
    }
    if (config.supportDashboardPasswordHash && token === config.supportDashboardPasswordHash) {
        return next()
    }

    res
        .status(401)
        .json({
            auth: false,
            status: 'error',
            message: 'Not authorized.',
        })
        .end()
}

// ######################## DATA ###########################

const createResponseData = () => {
    return {
        auth: true,
        forwardReserveFee: config.forwardReserveFee,
        intraHubFee: config.intraHubFee,
        allowLightningPaymentToNode: config.allowLightningPaymentToNode,
        accountCreationMode: config.accountCreationMode,
        generateSafetyOnChainAddress: config.generateSafetyOnChainAddress,
    }
}

// ######################## ROUTES ########################

const rateLimit = require('express-rate-limit')
const postLimiter = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: config.postRateLimit || 100,
})

router.get('/status', postLimiter, authenticateUser, async function (req, res) {
    logger.log('/api/support/status', [req.id])

    res.status(200).send(createResponseData())
})

router.post('/account-creation', postLimiter, authenticateUser, async function (req, res) {
    logger.log('/api/support/account-creation', [req.id])

    const creation = `${req.body.creation}`

    if (!['on', 'off', 'once'].includes(creation)) {
        res.status(400).send({ status: 'error', message: 'invalid data'})
        return
    }

    config.accountCreationMode = creation

    res.status(200).send(createResponseData())
})

router.get('/acccounts', postLimiter, authenticateUser, async function (req, res) {
    logger.log('/acccounts', [req.id])

    let userKeys = await redis.keys('user_*')

    const userIds = await redis.mget(userKeys)
    let numOfSats = 0

    for (let i = 0; i < userIds.length; ++i) {
        const userId = userIds[i]

        let U = new User(redis, bitcoinclient, lightning)
        U._userid = userId
        numOfSats += await U.getBalance()
    }

    res.status(200).send({
        type: 'accounts',
        numOfSats,
        userIds,
    })
})

router.get('/account/:userId', postLimiter, authenticateUser, async function (req, res) {
    logger.log('/account/:userId', [req.id, req.params.userId])

    const userId = (req.params && req.params.userId) || false
    if (userId === false) res.status(400).send({ code: 12313 })

    let U = new User(redis, bitcoinclient, lightning)

    let calculatedBalance = 0

    U._userid = userId

    const addr = await U.getOrGenerateAddress()
    let userinvoices = await U.getUserInvoices()
    let txs = await U.getTxs()

    for (let invo of userinvoices) {
        if (invo && invo.ispaid) {
            //console.log('+', +invo.amt, new Date(invo.timestamp * 1000).toString());
            calculatedBalance += +invo.amt;
        }
    }

    for (let tx of txs) {
        if (tx.type === 'bitcoind_tx') {
            //console.log('+', new BigNumber(tx.amount).multipliedBy(100000000).toNumber(), '[on-chain refill]');
            calculatedBalance += new BigNumber(tx.amount).multipliedBy(100000000).toNumber();
        } else {
            //console.log('-', +tx.value, new Date(tx.timestamp * 1000).toString(), tx.memo, '; preimage:', tx.payment_preimage || '');
            calculatedBalance -= +tx.value;
        }
    }

    let locked = await U.getLockedPayments();
    for (let loc of locked) {
        //console.log('-', loc.amount + /* fee limit */ Math.floor(loc.amount * config.forwardReserveFee), new Date(loc.timestamp * 1000).toString(), '[locked]');
    }
    /*
        console.log('txs:', txs.length, 'userinvoices:', userinvoices.length);
    */

    res.status(200).send({
        auth: true,
        forwardReserveFee: config.forwardReserveFee,
        btcAddress: addr,
        numOfSats: calculatedBalance,
        userinvoices,
        txs,
        locked,
    })
})



module.exports = router
