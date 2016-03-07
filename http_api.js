var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    db = require('./db.js'),
    mailer = require('./mailer.js'),
    port = 3005,
    router = express.Router();              // get an instance of the express Router

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());


// ROUTES FOR OUR API
// =============================================================================


//Add a simple middleware function to check auth state
function checkAuthByKey(req, res, next) {
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
    res.setHeader('Content-Type', 'application/json');
    var response = res.locals.response;
    response.then(function (data) {
        res.end(JSON.stringify(data));
    }, function (error) {
        res.end(JSON.stringify(error));
    })

}//Add a simple middleware function to return ERRORS
function returnError(err, req, res, next) {
    console.log("Returning error:");
    console.trace(err);
    var response = res.locals.response;
    res.setHeader('Content-Type', 'application/json');
    if(response) {
       return res.end(JSON.stringify(response));
    }
    return res.end(JSON.stringify({error: 'API_ERROR'}));

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


router.use(checkAuthByKey);

router.post('/links', function (req, res, next) {
    res.locals.response = db.getLinks(res.locals.user.id);
    next();
});

router.post('/links/add', function (req, res, next) {
    res.locals.response = db.createLink(res.locals.user.id, req.body.url);
    next();
});

router.post('/link/:linkId', function (req, res, next) {
    res.locals.response = db.getLinkById(res.locals.user.id, req.params.linkId);
    next();
});

router.post('/link/:linkId/cars', function (req, res, next) {
    res.locals.response = db.getLinkCars(res.locals.user.id, req.params.linkId);
    next();
});

router.post('/link/:linkId/carsremoved', function (req, res, next) {
    res.locals.response = db.getLinkCarsRemoved(res.locals.user.id, req.params.linkId);
    next();
});

router.post('/link/:linkId/update', function (req, res, next) {
    res.locals.response = db.runLinkById(res.locals.user.id, req.params.linkId);
    next();
});

router.post('/link/:linkId/remove', function (req, res, next) {
    res.locals.response = db.removeLink(res.locals.user.id, req.params.linkId);
    next();
});

router.post('/link/:linkId/sendmail', function (req, res, next) {
    res.locals.response = db.sendMailToLink(res.locals.user.id, req.params.linkId, req.body.sendmail);
    next();
});

router.post('/link/:linkId/sequence', function (req, res, next) {
    res.locals.response = db.getLinkSequences(res.locals.user.id, req.params.linkId);
    next();
});

router.post('/link/:linkId/sequence/:sequenceId', function (req, res, next) {
    res.locals.response = db.getAddedCarsForSequence(res.locals.user.id, req.params.linkId, req.params.sequenceId);
    next();
});

router.post('/link/:linkId/sequence/:sequenceId/removed', function (req, res, next) {
    res.locals.response = db.getRemovedCarsForSequence(res.locals.user.id, req.params.linkId, req.params.sequenceId);
    next();
});

router.use(returnJSON);
router.use(returnError);


// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api', router);

// START THE SERVER
// =============================================================================
db.startup(false).then(function () {
    app.listen(port);
    console.log('Magic happens on port ' + port);
});