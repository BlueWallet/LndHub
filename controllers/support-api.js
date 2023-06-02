const config = require('../config')
let express = require('express')
let router = express.Router()
let logger = require('../utils/logger')
const { createHash } = require('crypto')


// ######################## HELPERS ########################

const isAuth = () => {
    createHash('sha256').update('bacon').digest('hex')
}
// ######################## ROUTES ########################

const rateLimit = require('express-rate-limit')
const postLimiter = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: config.postRateLimit || 100,
})

router.get('/api/support/status', postLimiter, async function (req, res) {
    logger.log('/api/support/status', [req.id])

    res.send({ auth: false })
})

module.exports = router
