const express = require('express');
const router = express.Router()
const fs = require('fs')
const mustache = require('mustache')
const logger = require('../utils/logger')
const shared = require('../utils/shared')
const qr = require('qr-image')
const config = require('../config')

shared.supportDashboardShowAccounts = config.supportDashboardShowAccounts

router.get('/', function (req, res) {
    logger.log('/support', [req.id]);
    res.setHeader('Content-Type', 'text/html')

    const sidebarTpl = fs.readFileSync('./templates/sidebar.html').toString('utf8')
    const sidebar = mustache.render(sidebarTpl, Object.assign({}, shared))

    const supportTpl = fs.readFileSync('./templates/support.html').toString('utf8')

    const html = mustache.render(supportTpl, Object.assign({
        sidebar: sidebar
    }, shared))
 
    return res.status(200).send(html)
})

router.get('/account/:userId', function (req, res) {
    if (!config.supportDashboardShowAccounts) return res.status(200).send('not activated in config')

    logger.log('/account', [req.id])
    res.setHeader('Content-Type', 'text/html')

    const sidebarTpl = fs.readFileSync('./templates/sidebar.html').toString('utf8')
    const sidebar = mustache.render(sidebarTpl, Object.assign({}, shared))

    const accountTpl = fs.readFileSync('./templates/account.html').toString('utf8')

    const html = mustache.render(accountTpl, Object.assign({
        sidebar: sidebar
    }, shared))

    return res.status(200).send(html)
})

module.exports = router
