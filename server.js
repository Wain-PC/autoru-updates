// server.js

var express    = require('express');
var app        = express();
var bodyParser = require('body-parser');
var ExpressHandlebars  = require('express-handlebars');
var hbs = ExpressHandlebars.create({defaultLayout: 'main'});
var db = require('./db.js');


//configure Express to use Handlebars
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = 3003;

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();              // get an instance of the express Router

router.get('/add', function(req, res) {
    var url = decodeURIComponent(req.query.url);
    if(url) {
        return db.addQueueItem(url).then(function (result) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
        });
    }
    else {
        res.setHeader('Content-Type', 'text/plain');
        res.end('NO_URL_GIVEN');
    }
});

router.get('/', function(req, res) {
    return res.render('links');
});


router.get('/update/', function(req, res) {
    var id = decodeURIComponent(req.query.id);
    if(id) {
        return db.runLinkById(id).then(function (result) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
        });
    }
    else {
        res.setHeader('Content-Type', 'text/plain');
        res.end('NO_URL_GIVEN');
    }
});

// more routes for our API will happen here

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/', router);

// START THE SERVER
// =============================================================================
db.startup().then(function () {
    app.listen(port);
    console.log('Magic happens on port ' + port);
});