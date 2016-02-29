var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    db = require('./db.js'),
    mailer = require('./mailer.js'),
    port = 3003,
    router = express.Router();              // get an instance of the express Router

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());


// ROUTES FOR OUR API
// =============================================================================


//Add a simple middleware function to check auth state
function checkAuthByKey(req, res, next) {
    console.log("CheckAuthByKey");
    var authKey = req.body.authkey;
    return db.getUserByAuthKey(authKey)
        .then(function (user) {
            //do stuff
            res.locals.user = user;
            next();
        })
        .catch(function (error) {
            res.end(JSON.stringify(error));
        });
}
//Add a simple middleware function to return JSON if possible
function returnJSON(req, res, next) {
    var response = res.locals.response;
    res.setHeader('Content-Type', 'application/json');

}


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


router.post(checkAuthByKey);

router.post('/links/get', function (req, res, next) {
    return db.getLinks(res.locals.user.id)
        .then(function (data) {
            res.locals.response = data;
            next();
        });
});

router.post('/links/add', function (req, res, next) {
    var linkUrl = req.body.url;
    return db.createLink(res.locals.user.id, linkUrl)
        .then(function (data) {
            res.locals.response = data;
            next();
        });
});

router.post('/link/:linkId', function (req, res, next) {
    return db.getLinkById(user.id, req.params.linkId)
        .then(function (data) {
            res.locals.response = data;
            next();
        });
});

router.post('/link/:linkId/updates', function (req, res, next) {
    return db.getLinkSequences(user.id, req.params.linkId)
        .then(function (data) {
            res.locals.response = data;
            next();
        });
});

router.post('/link/:linkId/update', function (req, res, next) {
    return db.runLinkById(user.id, req.params.linkId)
        .then(function (data) {
            res.locals.response = data;
            next();
        });
});

router.post('/link/:linkId/remove', function (req, res, next) {
    return db.removeLink(user.id, req.params.linkId)
        .then(function (data) {
            res.locals.response = data;
            next();
        });
});

router.post('/link/:linkId/sendmail', function (req, res, next) {
    return db.sendMailToLink(user.id, req.params.linkId, sendMail)
        .then(function (data) {
            res.locals.response = data;
            next();
        });
});

router.post(returnJSON);


// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api', router);

// START THE SERVER
// =============================================================================
db.startup(false).then(function () {
    app.listen(port);
    console.log('Magic happens on port ' + port);
});