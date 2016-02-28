// server.js

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var db = require('./db.js');
var mailer = require('./mailer.js');

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

var port = 3003;

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();              // get an instance of the express Router

router.post('/user/register', function (req, res) {
    var login = req.body.login,
        password = req.body.password;

    res.setHeader('Content-Type', 'application/json');
    return db.createUser(login, password, false).then(function (result) {
        res.end(JSON.stringify(result));
    }, function (error) {
        res.end(JSON.stringify(error));
    });
});


router.post('/user/login', function (req, res) {
    var login = req.body.login,
        password = req.body.password;

    res.setHeader('Content-Type', 'application/json');
    return db.authenticateUser(login, password).then(function (result) {
        res.end(JSON.stringify(result));
    }, function (error) {
        res.end(JSON.stringify(error));
    });
});

router.post('/links/get', function (req, res) {
    var authKey = req.body.authkey;
    res.setHeader('Content-Type', 'application/json');

    return db.getUserByAuthKey(authKey)
        .then(function (user) {
            return db.getLinks(user.id);
        })
        .then(function (links) {
            res.end(JSON.stringify(links));
        })
        .catch(function (error) {
            res.end(JSON.stringify(error));
        });
});

router.post('/links/add', function (req, res) {
    var authKey = req.body.authkey,
        linkUrl = req.body.url;
    res.setHeader('Content-Type', 'application/json');

    return db.getUserByAuthKey(authKey)
        .then(function (user) {
            return db.createLink(user.id, linkUrl);
        })
        .then(function (link) {
            res.end(JSON.stringify(link));
        })
        .catch(function (error) {
            res.end(JSON.stringify(error));
        });
});

router.post('/link/:linkId', function (req, res) {
    var authKey = req.body.authkey,
        linkId = req.params.linkId;
    res.setHeader('Content-Type', 'application/json');

    return db.getUserByAuthKey(authKey)
        .then(function (user) {
            return db.getLinkById(user.id, linkId);
        })
        .then(function (link) {
            res.end(JSON.stringify(link));
        })
        .catch(function (error) {
            res.end(JSON.stringify(error));
        });
});

router.post('/link/:linkId/updates', function (req, res) {
    var authKey = req.body.authkey,
        linkId = req.params.linkId;
    res.setHeader('Content-Type', 'application/json');

    return db.getUserByAuthKey(authKey)
        .then(function (user) {
            return db.getLinkSequences(user.id, linkId);
        })
        .then(function (link) {
            res.end(JSON.stringify(link));
        })
        .catch(function (error) {
            res.end(JSON.stringify(error));
        });
});


router.post('/link/:linkId/update', function (req, res) {
    var authKey = req.body.authkey,
        linkId = req.params.linkId;
    res.setHeader('Content-Type', 'application/json');

    return db.getUserByAuthKey(authKey)
        .then(function (user) {
            return db.runLinkById(user.id, linkId);
        })
        .then(function (link) {
            res.end(JSON.stringify(link));
        })
        .catch(function (error) {
            res.end(JSON.stringify(error));
        });
});

router.post('/link/:linkId/remove', function (req, res) {
    var authKey = req.body.authkey,
        linkId = req.params.linkId;
    res.setHeader('Content-Type', 'application/json');

    return db.getUserByAuthKey(authKey)
        .then(function (user) {
            return db.removeLink(user.id, linkId);
        })
        .then(function (link) {
            res.end(JSON.stringify(link));
        })
        .catch(function (error) {
            res.end(JSON.stringify(error));
        });
});
router.post('/link/:linkId/sendmail', function (req, res) {
    var authKey = req.body.authkey,
        linkId = req.params.linkId,
        sendMail = req.body.sendmail == 1;
    res.setHeader('Content-Type', 'application/json');

    return db.getUserByAuthKey(authKey)
        .then(function (user) {
            return db.sendMailToLink(user.id, linkId, sendMail);
        })
        .then(function (link) {
            res.end(JSON.stringify(link));
        })
        .catch(function (error) {
            res.end(JSON.stringify(error));
        });
});


// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api', router);

// START THE SERVER
// =============================================================================
db.startup(false).then(function () {
    app.listen(port);
    console.log('Magic happens on port ' + port);
});