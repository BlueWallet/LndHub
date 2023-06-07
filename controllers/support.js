const express = require('express');
const router = express.Router()
const fs = require('fs')
const mustache = require('mustache')
const logger = require('../utils/logger')
const shared = require('../utils/shared')
const qr = require('qr-image')
const config = require('../config')

router.get('/', function (req, res) {
    logger.log('/support', [req.id]);
    res.setHeader('Content-Type', 'text/html')
    let html = fs.readFileSync('./templates/support.html').toString('utf8')

    return res.status(200).send(mustache.render(html, Object.assign({}, shared)))
});

module.exports = router
