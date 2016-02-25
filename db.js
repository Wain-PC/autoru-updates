"use strict";

module.exports = (function () {
    var Sequelize = require("sequelize"),
        processor = require('./processor.js'),
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
                storage: dbPath
            });
        },

        createModels = function (withClear) {
            models.link = sequelize.define('link', {
                link: {
                    type: Sequelize.STRING
                },
                sequenceId: {
                    type: Sequelize.INTEGER,
                    defaultValue: 0
                },
                runPeriod: {
                    type: Sequelize.INTEGER,
                    defaultValue: 15
                },
                nextRun: {
                    type: Sequelize.DATE,
                    allowNull: true,
                    defaultValue: null
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

                sequenceChecked: {
                    type: Sequelize.INTEGER,
                    defaultValue: 0
                }
            });

            //define many-to-one relationship
            models.car.belongsTo(models.link);

            return Promise.all([models.link.sync({force: !!withClear}), models.car.sync({force: !!withClear})]);
        },

        startup = function (purgeDB) {
            connect();
            return createModels(!!purgeDB);
        },


        getLink = function (url) {
            //create without a check
            return models.link.findOrCreate({
                where: {
                    link: url
                },
                defaults: {
                    link: url
                }

            }).then(function (links) {
                return links[0];
            });
        },

        incrementLink = function (url) {
            //this actually doesn't check for the same urls for different users, if the system will grow
            return models.link.findOne(
                {
                    where: {
                        link: url
                    }
                }
            ).then(function (foundLink) {
                //if the link is present, increment the sequenceID by one
                if (foundLink) {
                    return foundLink.increment({sequenceId: 1}).then(function (fl) {
                        return fl;
                    });
                }
                //create if not found
                return getLink(url);
            })
        },

        saveCars = function (carsInstancesArray) {
            var i, length, promisesArray = [];

            if (!(carsInstancesArray instanceof Array)) {
                return false;
            }
            i = 0;
            length = carsInstancesArray.length;

            for (i; i < length; i++) {
                promisesArray.push(saveCar(carsInstancesArray[i]));
            }
            return Promise.all(promisesArray).then(function (promisesResultsArray) {
                var i, length = promisesResultsArray.length, outArray = [];
                //this will return an array containing only CHANGED values
                for (i = 0; i < length; i++) {
                    if (promisesResultsArray[i].sequenceChecked !== 0) {
                        outArray.push(promisesResultsArray[i].get());
                    }
                }
                return outArray;
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
                    savedCar.sequenceChecked = carInstance.sequenceChecked;
                    return savedCar.save();
                }
                else {
                    //save new car
                    //console.log('Saving a new car:', carInstance.id);
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
                        var now = new Date(), promisesArray = [];
                        console.log("Found %s links on startup:", links.length);
                        links.forEach(function (link, index) {
                            if(!link) return;
                            link.nextRun = new Date(now.getTime() + index * queueCheckInterval);
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
            var now = new Date().getTime();
                 models.link.findOne({
                    order: [['nextRun', 'DESC']]
                }).then(function (link) {
                     //if the queue is empty, do nothing
                     if(!link) {
                         console.log("Queue seems to be empty");
                         return false;
                     }

                     //if the time has come to execute the item, run in
                    if(link.nextRun.getTime() < now.getTime) {
                        return executeQueueItem(link);
                    }
                     return false;
                });
        },

        executeQueueItem = function (link) {
            if(!link || !link.id) {
                return false;
            }
            if (!runningJob) {
                runningJob = link.id;
                return processor.processUrl(link.url)
                    .then(function () {
                        runningJob = false;
                        return checkQueue();
                    });
            }
        };

    return {
        startup: startup,
        saveCars: saveCars,
        incrementLink: incrementLink,
        initQueue: initQueue,
        checkQueue: checkQueue,
        startQueue: startQueue,
        stopQueue: stopQueue
    };

})();