"use strict";

module.exports = (function () {
    var Sequelize = require("sequelize"),
        parser = require('./parser.js'),
        sequelize,
        dbPath = './database_test.sqlite',
        models = {
            car: null,
            link: null
        },
        runningJob = null,
        queueCheckInterval = 30000,
        queueCheckIntervalTimer = null,
        passSalt = 'H;fd6%idsDbLT#(!^M@F*S)',

        connect = function () {
            return sequelize = new Sequelize('autoru', 'root', null, {
                host: '127.0.0.1',
                dialect: 'sqlite',
                pool: {
                    max: 5,
                    min: 0,
                    idle: 10000
                },
                storage: dbPath,
                logging: false
            });
        },

        createModels = function (withClear) {
            var syncModelPromise = Promise.resolve(),
                modelName;

            models.user = sequelize.define('user', {
                email: {
                    type: Sequelize.STRING(100),
                    unique: true
                },
                password: {
                    type: Sequelize.STRING(200)
                },

                authKey: {
                    type: Sequelize.STRING(200)
                },
                demo: {
                    type: Sequelize.BOOLEAN,
                    defaultValue: false
                }
            });


            models.link = sequelize.define('link', {
                link: {
                    type: Sequelize.STRING
                },
                runPeriod: {
                    type: Sequelize.INTEGER,
                    defaultValue: 15
                },
                nextRun: {
                    type: Sequelize.DATE
                },
                sendMail: {
                    type: Sequelize.BOOLEAN,
                    defaultValue: true
                }
            });

            models.sequence = sequelize.define('sequence', {
                carsAdded: {
                    type: Sequelize.INTEGER,
                    defaultValue: 0
                },
                carsRemoved: {
                    type: Sequelize.INTEGER,
                    defaultValue: 0
                },
                carsNotChanged: {
                    type: Sequelize.INTEGER,
                    defaultValue: 0
                }
            });

            models.car = sequelize.define('car', {
                id: {
                    type: Sequelize.BIGINT,
                    primaryKey: true
                },

                linkId: {
                    type: Sequelize.INTEGER,
                    primaryKey: true
                },

                url: {
                    type: Sequelize.STRING(1000)
                },

                created: {
                    type: Sequelize.DATE
                },

                updated: {
                    type: Sequelize.DATE
                },

                watched: {
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.NOW
                },

                mark: {
                    type: Sequelize.STRING
                },

                model: {
                    type: Sequelize.STRING
                },

                generation: {
                    type: Sequelize.STRING
                },

                gearbox: {
                    type: Sequelize.STRING
                },

                year: {
                    type: Sequelize.INTEGER
                },

                owners: {
                    type: Sequelize.INTEGER
                },

                price: {
                    type: Sequelize.INTEGER
                },

                run: {
                    type: Sequelize.INTEGER
                },

                condition: {
                    type: Sequelize.INTEGER
                },

                autoruUserId: {
                    type: Sequelize.INTEGER,
                    field: 'user_id'
                },

                vin: {
                    type: Sequelize.BOOLEAN
                },

                checked: {
                    type: Sequelize.BOOLEAN
                },

                sequenceLastChecked: {
                    type: Sequelize.INTEGER,
                    defaultValue: 0
                }
            });

            //define many-to-one relationships
            models.link.belongsTo(models.user, {
                onDelete: 'cascade'
            });
            models.user.hasMany(models.link);

            models.car.belongsTo(models.link, {
                onDelete: 'cascade'
            });
            models.link.hasMany(models.car);

            models.car.belongsTo(models.sequence);
            models.sequence.hasMany(models.car);

            models.sequence.belongsTo(models.link, {
                onDelete: 'cascade'
            });
            models.link.hasMany(models.sequence);

            for (modelName in models) {
                if (models.hasOwnProperty(modelName)) {
                    syncModelPromise = syncModelPromise.then((function (modelName) {
                        return function () {
                            return models[modelName].sync({force: !!withClear});
                        }
                    })(modelName));
                }
            }

            return syncModelPromise;
        },

        startup = function (purgeDB) {
            connect();
            return createModels(!!purgeDB);
        },


        createUser = function (email, password, demoMode) {
            var crypto = require('crypto'),
                emailValidator = require('email-validator'),
                hash = crypto.createHash('sha1');

            if (!emailValidator.validate(email)) {
                return promiseError('EMAIL_NOT_VALID');
            }

            hash.update(new Date().getTime().toString() + email + passSalt);
            hash = hash.digest('hex');

            return models.user.findOrCreate({
                where: {
                    email: email
                },
                defaults: {
                    email: email,
                    authKey: hash,
                    password: getUserPasswordHash(password),
                    demo: !!demoMode
                },
                attributes: ['email', 'authKey']
            }).then(function (users) {
                if (users && users[0]) {
                    return {
                        email: users[0].email,
                        authKey: users[0].authKey
                    }
                }
                return promiseError('ERROR_CREATING_USER');
            });
        },

        getUserPasswordHash = function (password) {
            var crypto = require('crypto'),
                emailValidator = require('email-validator'),
                hash = crypto.createHash('sha1');
            hash.update(password + passSalt);
            return hash.digest('hex');
        },

        authenticateUser = function (login, password) {
            if (!login || !password) {
                return promiseError('NO_LOGIN_OR_PASS');
            }
            return models.user.findOne({
                where: {
                    email: login,
                    password: getUserPasswordHash(password)
                },
                attributes: ['email', 'authKey']
            }).then(function (user) {
                return user || promiseError('AUTH_FAIL');
            });
        },

        getUserById = function (userId) {
            return models.user.findOne({
                where: {
                    id: userId
                }
            }).then(function (user) {
                if (user) {
                    return user.get();
                }
                return promiseError('USER_NOT_FOUND');
            });
        },

        getUserByAuthKey = function (authKey) {
            if (!authKey) {
                return promiseError('NO_AUTHKEY');
            }
            return models.user.findOne({
                where: {
                    authKey: authKey
                }
            }).then(function (user) {
                if (user) {
                    return user.get();
                }
                return promiseError('USER_NOT_FOUND');
            });
        },

        createLink = function (userId, url) {
            if (!userId || !url) {
                return promiseError('NO_USERID_OR_URL');
            }

            return getUserById(userId).then(function (user) {
                //TODO: add check whether a user can create new link or not (linkLimit, demoMode or something)
                return models.link.findOrCreate({
                        where: {
                            link: url,
                            userId: user.id
                        },
                        defaults: {
                            link: url,
                            userId: user.id,
                            nextRun: new Date()
                        }
                    })
                    .then(function (links) {
                        return links[0];
                    });
            });
        },

        createLinkFiltered = function (userId, linkId) {
            return createLink(userId, linkId)
                .then(filterLinkOutput);
        },

        getLinkByIdFiltered = function (userId, linkId) {
            return getLinkById(userId, linkId)
                .then(filterLinkOutput);
        },


        removeLink = function (userId, linkId) {
            return getUserById(userId).then(function (user) {
                return models.link.destroy({
                    where: {
                        id: linkId,
                        userId: user.id
                    }
                }).then(function (result) {
                    return {
                        result: result
                    }
                })
            });
        },

        sendMailToLink = function (userId, linkId, sendMail) {
            return getUserById(userId).then(function (user) {
                return getLinkById(userId, linkId)
                    .then(function (link) {
                        link.sendMail = !!sendMail;
                        return link.save();
                    })
                    .then(filterLinkOutput);
            });
        },

        getLinkAndCreateSequence = function (userId, url) {
            return createLink(userId, url).then(function (link) {
                return createSequence(link.id).then(function (sequence) {
                    console.log("Creating sequence %s", sequence.id);
                    link.currentSequence = sequence.id;
                    return link;
                });
            });
        },

        getLinks = function (userId) {
            //create without a check
            return models.link.findAll({
                where: {
                    userId: userId
                }
            });
        },

        getLinkById = function (userId, linkId) {
            //create without a check
            return models.link.findOne({
                where: {
                    id: linkId,
                    userId: userId
                }
            }).then(function (link) {
                if (link === null) {
                    return promiseError('LINK_NOT_FOUND');
                }
                return link;
            });
        },

        createSequence = function (linkId) {
            return models.sequence.create({
                linkId: linkId
            });
        },

        updateSequence = function (sequenceId, carsAdded, carsRemoved, carsNotChanged) {
            return models.sequence.update({
                carsAdded: +carsAdded || 0,
                carsRemoved: +carsRemoved || 0,
                carsNotChanged: +carsNotChanged || 0
            }, {
                where: {
                    id: sequenceId
                }
            }).then(function (sequences) {
                if (sequences && sequences.length) {
                    return sequences[0];
                }
                return null;
            });
        },

        getLinkSequences = function (userId, linkId) {
            //create without a check
            return models.link.findOne({
                where: {
                    id: linkId,
                    userId: userId
                },
                include: [models.sequence]
            }).then(function (link) {
                if (!link) {
                    return promiseError('LINK_NOT_FOUND');
                }
                if (link.sequences && link.sequences.length) {
                    return link.sequences;
                }
                return promiseError('NO_SEQUENCES_FOUND');
            });
        },

        saveCars = function (carsInstancesArray, link) {
            var i, length, promise = Promise.resolve(),
                linkId, outObj = {
                    created: [],
                    removed: [],
                    notChanged: []
                };


            if (!(carsInstancesArray instanceof Array) || !carsInstancesArray.length) {
                return promise.then(outObj);
            }
            i = 0;
            length = carsInstancesArray.length;
            linkId = carsInstancesArray[0].linkId;

            for (i; i < length; i++) {
                //append linkId to each of the items
                carsInstancesArray[i]['linkId'] = link.id;
                carsInstancesArray[i]['sequenceLastChecked'] = link.currentSequence;
                promise = promise.then(saveCar.bind(null, carsInstancesArray[i]));
            }
            return promise.then(function () {
                //get all cars
                return models.car.findAll({
                    where: {
                        linkId: link.id
                    }
                }).then(function (cars) {
                    var length;
                    //sort by new ones and removed ones
                    length = cars.length;
                    for (i = 0; i < length; i++) {
                        //that means the car has been deleted, as it hasn't been checked
                        if (cars[i].sequenceLastChecked !== link.currentSequence) {
                            outObj.removed.push(cars[i].get());
                        }
                        //that means the car has been added during the last sequence (it's new)
                        else if (cars[i].sequenceLastChecked === cars[i].sequenceId) {
                            outObj.created.push(cars[i].get());
                        }
                        else {
                            outObj.notChanged.push(cars[i].get());
                        }
                    }
                    //save stats to the sequence
                    return updateSequence(link.currentSequence, outObj.created.length, outObj.removed.length, outObj.notChanged.length)
                        .then(function () {
                            return outObj;
                        });
                })
            });
        },

        saveCar = function (carInstance) {
            return models.car.findOne({
                where: {
                    id: carInstance.id,
                    linkId: carInstance.linkId
                }
            }).then(function (savedCar) {
                if (savedCar) {
                    //update the car's sequenceId
                    savedCar.sequenceLastChecked = carInstance.sequenceLastChecked;
                    return savedCar.save();
                }
                else {
                    //save new car
                    carInstance.sequenceId = carInstance.sequenceLastChecked;
                    //console.log('Saving a new car: %s SQID: %s LASTCHECK: %s', carInstance.id, carInstance.sequenceId, carInstance.sequenceLastChecked);
                    return models.car.create(carInstance).catch(function (err) {
                        console.error("Error creating a car:", err);
                    });
                }
            });
        },

        initQueue = function (purgeDB) {
            //Step 1. Start the DB
            return startup(purgeDB).then(function () {
                //Step 2. Get all links
                models.link.findAll()
                    .then(function (links) {
                        //Step 3. Process each link and add nearest available execution time
                        //let's assume the execution takes 30 sec.
                        var nowTime = new Date().getTime(), promisesArray = [];
                        console.log("Found %s links on startup:", links.length);
                        links.forEach(function (link, index) {
                            if (!link) return;
                            link.nextRun = new Date(nowTime + index * queueCheckInterval);
                            promisesArray.push(link.save());
                        });
                        return Promise.all(promisesArray);
                    })
                    .then(function () {
                        queueCheckIntervalTimer = setInterval(checkQueue, queueCheckInterval);
                        return checkQueue();
                    });

            });
        },

        startQueue = function () {
            console.log("Queue started");
            queueCheckIntervalTimer = setInterval(checkQueue, queueCheckInterval);
            checkQueue();
            return queueCheckIntervalTimer;
        },

        stopQueue = function () {
            console.log("Queue stopped");
            return clearInterval(queueCheckIntervalTimer);
        },

        checkQueue = function () {
            var nowTime = new Date().getTime();
            models.link.findOne({
                order: [['nextRun', 'ASC']]
            }).then(function (link) {
                //if the queue is empty, do nothing
                if (!link) {
                    console.log("Queue seems to be empty");
                    return false;
                }

                //if the time has come to execute the item, run in
                console.log("Check queue found latest link:", link.id, link.nextRun, link.nextRun.getTime());
                if (!link.nextRun || link.nextRun.getTime() < nowTime) {
                    return executeQueueItem(link);
                }
                return false;
            });
        },

        executeQueueItem = function (link) {
            if (!link || !link.id) {
                return false;
            }
            if (!runningJob) {
                runningJob = link.id;
                return parser.process(link.link, getLinkAndCreateSequence, saveCars)
                    .then(function () {
                        //update nextRun of the link
                        var nowTime = new Date().getTime();
                        link.nextRun = new Date(nowTime + link.runPeriod * 60000);
                        return link.save().then(function () {
                            runningJob = false;
                            return checkQueue();
                        })
                    });
            }
        },

        moveItemToQueueFront = function (link) {
            if (!link || !link.id) {
                return false;
            }

            link.nextRun = new Date();
            return link.save();
        },

        runLinkById = function (userId, linkId) {
            return getLinkById(userId, linkId)
                .then(moveItemToQueueFront)
                .then(filterLinkOutput);
        },

        filterLinkOutput = function (link) {
            return {
                id: link.id,
                url: link.link,
                sendMail: link.sendMail
            };
        },

        promiseError = function (errText) {
            return Promise.reject({error: errText});
        };

    return {
        startup: startup,
        saveCars: saveCars,
        getLinks: getLinks,
        getLinkById: getLinkByIdFiltered,
        createLink: createLinkFiltered,
        runLinkById: runLinkById,
        getLinkSequences: getLinkSequences,
        removeLink: removeLink,
        sendMailToLink: sendMailToLink,
        initQueue: initQueue,
        checkQueue: checkQueue,
        startQueue: startQueue,
        stopQueue: stopQueue,
        createUser: createUser,
        authenticateUser: authenticateUser,
        getUserByAuthKey: getUserByAuthKey
    };

})();