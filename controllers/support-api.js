const config = require('../config')
let express = require('express')
let router = express.Router()
let logger = require('../utils/logger')
const { createHash } = require('crypto')

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
        statusCreation: config.accountCreationMode
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
