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


const getUserIds = async () => {
    let userKeys = await redis.keys('user_*')

    shared.numOfAccounts = userKeys.length

    const userIds = await redis.mget(userKeys)
    let numOfSats = 0

    await getUserAccount(userIds[0])

    for (let i = 0; i < userIds.length; ++i) {
        const userId = userIds[i]

        let U = new User(redis, bitcoinclient, lightning)
        U._userid = userId
        numOfSats += await U.getBalance()
    }

    shared.numOfSats = numOfSats
}

const getUserAccount = async (userid) => {
    let U = new User(redis, bitcoinclient, lightning)

    U._userid = userid;

    /*
        const btcAddress = await u.getOrGenerateAddress()

        console.log('\ncalculatedBalance\n================\n', calculatedBalance, await U.getCalculatedBalance());
        console.log('txs:', txs.length, 'userinvoices:', userinvoices.length);

     */

/*
    return {
        btcAddress,
        dbBalance,
        calculatedBalance,
        userinvoices,
        txs,
        locked,
    }*/
}



(async () => {
    await getUserIds()
})()

setInterval(getUserIds, 60000);

// ######################## DATA ###########################

const createResponseData = () => {
    return {
        auth: true,
        forwardReserveFee: config.forwardReserveFee,
        intraHubFee: config.intraHubFee,
        allowLightningPaymentToNode: config.allowLightningPaymentToNode,
        accountCreationMode: config.accountCreationMode,
        generateSafetyOnChainAddress: config.generateSafetyOnChainAddress,
        numOfAccounts: shared.numOfAccounts,
        numOfSats: shared.numOfSats,
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

module.exports = router
