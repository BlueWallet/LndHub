const express = require('express');
const router = express.Router();
const fs = require('fs');
const mustache = require('mustache');
const logger = require('../utils/logger');
const qr = require('qr-image');

router.get('/support', function (req, res) {
    logger.log('/support', [req.id]);
    res.setHeader('Content-Type', 'text/html');
    let html = fs.readFileSync('./templates/support.html').toString('utf8');

    let data = {
        uris : ['Todo'],
        num_of_accounts: 0,
        num_of_sats: 0,
    }

    return res.status(200).send(mustache.render(html, Object.assign({}, data)));
});

module.exports = router;
