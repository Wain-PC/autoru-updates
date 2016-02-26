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

                userId: {
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

            //define many-to-one relationship
            models.car.belongsTo(models.link, {
                onDelete: 'cascade'
            });
            models.car.belongsTo(models.sequence);
            models.sequence.belongsTo(models.link, {
                onDelete: 'cascade'
            });

            return Promise.all([models.link.sync({force: !!withClear}), models.car.sync({force: !!withClear}), models.sequence.sync({force: !!withClear})]);
        },

        startup = function (purgeDB) {
            connect();
            return createModels(!!purgeDB);
        },

        createLink = function (url) {
            return models.link.findOrCreate({
                    where: {
                        link: url
                    },
                    defaults: {
                        link: url,
                        nextRun: new Date()
                    }

                })
                .then(function (links) {
                    return links[0];
                });
        },

        getLink = function (url) {
            //create without a check
            return createLink(url).then(function (link) {
                return createSequence(link.id).then(function (sequence) {
                    console.log("Creating sequence %s", sequence.id);
                    link.currentSequence = sequence.id;
                    return link;
                });
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
                return parser.process(link.link, getLink, saveCars)
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

        runLinkById = function (linkId, force) {
            return models.link.findOne({
                where: {
                    id: linkId
                }
            }).then(moveItemToQueueFront)
                .then(filterLinkOutput);
        },

        runLinkByUrl = function (linkUrl) {
            return models.link.findOne({
                where: {
                    link: linkUrl
                }
            }).then(moveItemToQueueFront)
                .then(filterLinkOutput)
        },

        addQueueItem = function (url) {
            return createLink(url)
                .then(filterLinkOutput);
        },

        filterLinkOutput = function (link) {
            return {
                id: link.id,
                url: link.link
            };
        };

    return {
        startup: startup,
        saveCars: saveCars,
        getLink: getLink,
        initQueue: initQueue,
        checkQueue: checkQueue,
        startQueue: startQueue,
        stopQueue: stopQueue,
        addQueueItem: addQueueItem,
        runLinkById: runLinkById,
        runLinkByUrl: runLinkByUrl
    };

})();