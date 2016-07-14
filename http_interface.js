// load dependencies 
var config = require('config').get('config.interface'),
    express = require('express'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    session = require('express-session'),
    moment = require('moment'),
    SequelizeStore = require('connect-session-sequelize')(session.Store),
    db = require('./db.js'),
    expressHbs = require('express-handlebars'),
    hbs = expressHbs.create(
        {
            extname: 'hbs',
            defaultLayout: 'main.hbs',
            helpers: {
                stripUrl: function (url) {
                    if (url && url.length > config.urlMaxLength) {
                        return url.substr(0, config.urlMaxLength) + '...';
                    }
                    return url;
                },
                momentFromNow: function (date) {
                    return moment(date).fromNow(); // 4 years ago
                },
                equals: function (one, two, options) {
                    if (one === two) {
                        return options.fn(this);
                    }
                    return options.inverse(this);
                },
                latest: function (array, param) {
                    return array[array.length - 1][param];
                },
                money: function (string) {
                    if (!string) {
                        return '';
                    }
                    string = string.toString().split('').reverse();
                    string = string.reduce(function (arr, item, index) {
                        if (index && index % 3 === 0) {
                            arr.push(' ');
                        }
                        arr.push(item);
                        return arr
                    }, []);
                    return string.reverse().join('');
                }
            }
        }
    ),
    router = express.Router(),
    port = 8080,

    checkLogin = function (req, res, next) {
        if (req.session && req.session.userId !== undefined) {
            return next();
        }
        return res.redirect('/login');
    },

    carSorter = function (req, cars) {
        var order = req.query.orderby,
            direction = parseInt(req.query.direction);

        if (isNaN(direction)) {
            direction = 1;
        }

        if (!order) {
            order = 'createdAt';
        }
        if (!direction) {
            direction = -1;
        }
        else {
            direction = 1;
        }

        return cars.sort(function (car1, car2) {
            if (typeof car1[order] === 'string') {
                return direction * car2[order].localeCompare(car1[order]);
            }
            else if (car1[order] instanceof Date) {
                return direction * (car2[order].getTime() - car1[order].getTime())
            }
            return direction * (car2[order] - car1[order])
        })
    },

    carsTableColumns = config.columns;

// configure express
var connection = db.startup().then(function (connection) {
    var seqStore = new SequelizeStore({
        db: connection.connection,
        checkExpirationInterval: config.session.checkExpired * 60 * 1000, // The interval at which to cleanup expired sessions (15 minutes)
        expiration: config.session.expiration * 60 * 60 * 1000  // The maximum age (in milliseconds) of a valid session (24 hours)
    });
    var app = express(),
        errorHandler = function (err, req, res, next) {
            console.error(err.stack);
            res.status(500);
            res.render('error');
        };
    app.use(express.static('static'));
    app.use(bodyParser.urlencoded({extended: true}));
    app.use(bodyParser.json());
    app.use(cookieParser());
    app.use(session({
        secret: config.session.secret,
        resave: true,
        saveUninitialized: true,
        store: seqStore
    }));
    app.engine('hbs', hbs.engine);
    app.set('view engine', 'hbs');
    seqStore.sync();
    moment.locale(config.locale);
//initialize the paths of the application

    router.get('/logout', function (req, res) {
        req.session.destroy();
        res.redirect('/login');
    });

    router.get('/login', function (req, res) {
        if (req.session.loginData) {
            res.render('login', req.session.loginData);
            delete req.session.loginData;
            return;
        }
        res.render('login');
    });


    router.post('/login', function (req, res) {
        var login = req.body.login,
            password = req.body.password;
        if (login && password) {
            return db.user.authenticate(login, password, false).then(function (user) {
                req.session.userId = user.id;
                req.session.save(function () {
                    res.redirect('/');
                });
            }, function (error) {
                req.session.loginData = {
                    login: login,
                    error: error
                };
                req.session.save(function () {
                    res.redirect('/login');
                });
            });
        }
        else {
            res.redirect('/login');
        }
    });


    router.get('/register', function (req, res) {
        if (req.session.loginData) {
            res.render('register', req.session.loginData);
            delete req.session.loginData;
            return;
        }
        res.render('register');
    });


    router.post('/register', function (req, res) {
        var login = req.body.login,
            password = req.body.password;
        if (login && password) {
            return db.user.create(login, password, true).then(function (user) {
                req.session.userId = user.id;
                req.session.save(function () {
                    res.redirect('/');
                });
            }, function (error) {
                req.session.loginData = {
                    login: login,
                    error: error
                };
                req.session.save(function () {
                    res.redirect('/register');
                });
            });
        }
        else {
            res.redirect('/login');
        }
    });

    router.use(checkLogin);


    router.get('/', function (req, res, next) {
        db.link.getAll(req.session.userId).then(function (links) {
            res.render('links', {links: links, message: req.session.message});
            delete req.session.message;
        });
    });

    router.post('/links/add', function (req, res) {
        var url = req.body.url;
        if (url) {
            return db.link.create(req.session.userId, url, req.body.sendmail === 'true').then(function (link) {
                if (link.id) {
                    req.session.message = 'Ссылка ' + link.id + ' успешно добавлена';
                    req.session.save(function () {
                        res.redirect('/');
                    });
                }
            }, function (error) {
                res.redirect('/');
            });
        }
        else {
            res.redirect('/links/add');
        }
    });


    router.get('/links/add', function (req, res) {
        res.render('linkAdd');
    });

    router.get('/link/:linkId/cars', function (req, res) {
        var order = req.query.orderby,
            direction = req.query.direction;
        db.link.getCars(req.session.userId, req.params.linkId, order, direction).then(function (cars) {

            res.render('cars', {
                columns: carsTableColumns,
                cars: carSorter(req, cars),
                url: req.path
            });
        });
    });


    router.get('/link/:linkId/settings', function (req, res) {
        var order = req.query.orderby,
            direction = req.query.direction;
        db.link.get(req.session.userId, req.params.linkId).then(function (link) {

            res.render('settings', {
                link: link,
                runps: config.runPeriods,
                message: req.session.message
            });
            delete req.session.message;
        });
    });


    router.post('/link/:linkId/settings', function (req, res) {
        var runPeriod = req.body.runperiod,
            sendMail = req.body.sendmail === 'true';

        return db.link.update(req.session.userId, req.params.linkId, runPeriod, sendMail)
            .then(function (response) {
                if (response.result && response.result == 1) {
                    req.session.message = 'Параметры успешно обновлены для ссылки ' + req.params.linkId;
                }
                else {
                    req.session.error = 'Ошибка обновления параметров для ссылки ' + req.params.linkId;
                }
                req.session.save(function () {
                    res.redirect('/link/' + req.params.linkId + '/settings');
                });
            });
    });

    router.get('/latest', function (req, res) {
        db.car.getLatest(req.session.userId).then(function (cars) {
            res.render('cars', {
                columns: carsTableColumns,
                cars: carSorter(req, cars),
                url: req.path
            });
        });
    });

    router.get('/link/:linkId/latest', function (req, res, next) {
        db.link.getLatestCars(req.session.userId, req.params.linkId).then(function (cars) {
            res.render('cars', {
                columns: carsTableColumns,
                cars: carSorter(req, cars),
                url: req.path
            });
        });
    });


    router.get('/link/:linkId/remove', function (req, res, next) {
        db.link.remove(req.session.userId, req.params.linkId).then(function (result) {
            req.session.message = 'Ссылка ' + req.params.linkId + ' успешно удалена';
            req.session.save(function () {
                res.redirect('/');
            });
        });
    });

    router.get('/link/:linkId/update', function (req, res, next) {
        db.link.run(req.session.userId, req.params.linkId).then(function (result) {
            req.session.message = 'Обновление запланировано для ссылки ' + req.params.linkId;
            req.session.save(function () {
                res.redirect('/');
            });
        });
    });

    router.get('/link/:linkId/sendmail', function (req, res, next) {
        db.link.sendMail(req.session.userId, req.params.linkId, !!req.params.sendmail).then(function (result) {
            if (req.params.sendmail) {
                req.session.message = 'Уведомления <b>включены</b> для ссылки ' + req.params.linkId;
            }
            else {
                req.session.message = 'Уведомления <b>выключены</b> для ссылки ' + req.params.linkId;
            }
            req.session.save(function () {
                res.redirect('/');
            });
        });
    });

    router.get('/link/:linkId/sequence', function (req, res, next) {
        db.link.getSequences(req.session.userId, req.params.linkId).then(function (sequences) {
            res.render('sequences', {
                sequences: sequences
            });
        });
    });

    router.get('/link/:linkId/sequence/:sequenceId', function (req, res, next) {
        db.sequence.getCars(req.session.userId, req.params.linkId, req.params.sequenceId).then(function (cars) {
            res.render('cars', {
                columns: carsTableColumns,
                cars: carSorter(req, cars)
            });
        });
    });


    router.get('/car/:carId', function (req, res, next) {
        db.car.get(req.session.userId, req.params.carId).then(function (car) {
            res.render('gallery', {
                car: car
            });
        });
    });

    router.get('/settings', function (req, res) {
        db.user.get({id: req.session.userId}).then(function (user) {
            res.render('usersettings', {
                user: user,
                message: req.session.message
            });
            delete req.session.message;
        });
    });

    router.get('/settings/removetelegram', function (req, res) {
        return db.telegram.removeChat(req.session.userId).then(function () {
            req.session.message = 'Чат Telegram успешно удален';
        }, function () {
            req.session.message = 'Произошла ошибка при удалении чата Telegram';
        })
            .then(function () {
                req.session.save(function () {
                    res.redirect('/settings');
                });
            });
    });

    router.use(function (req, res) {
        res.status(404);
        res.render('404');
    });


    router.use(errorHandler);
    app.use(errorHandler);


//initialize the app
    console.log("Frontend server started");

    app.use('/', router);
    app.listen(port, 'localhost');
});