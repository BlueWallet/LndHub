let express = require('express');
let router = express.Router();
let fs = require('fs');
let mustache = require('mustache');
let lightning = require('../lightning');

router.get('/', function(req, res) {
  let html = fs.readFileSync('./templates/index.html').toString('utf8');
  lightning.getInfo({}, function(err, info) {
    if (err) {
      console.error('lnd failure');
      process.exit(3);
    }
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(mustache.render(html, info));
  });
});

router.use(function(req, res) {
  res.status(404).send('404');
});

module.exports = router;
