"use strict";

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

    /**
     * Connects to the DB (sqlite@localhost)
     * @returns sequelize instance
     */
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

    /**
     * Creates data models in DB
     * @param withClear If true, this will purge the data in the DB.
     */
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

    /**
     * Basic startup procedure. Includes connecting to the DB and creating models.
     * @param purgeDB
     */
    startup = function (purgeDB) {
        connect();
        return createModels(!!purgeDB);
    },


    /**
     * Create a new User in the DB
     * @param email User email address
     * @param password User password
     * @param demoMode If true, user will be created in demo mode (preview mode, limited API access, etc.)
     * @returns Promise.<models.user>
     */
    createUser = function (email, password, demoMode) {
        var crypto = require('crypto'),
            emailValidator = require('email-validator'),
            hash = crypto.createHash('sha1');

        if (!emailValidator.validate(email)) {
            return promiseError('EMAIL_NOT_VALID');
        }

        hash.update(new Date().getTime().toString() + email + passSalt);
        hash = hash.digest('hex');

        return models.user.create({
            email: email,
            authKey: hash,
            password: getUserPasswordHash(password),
            demo: !!demoMode
        }).then(function (users) {
            if (users && users[0]) {
                return {
                    email: users[0].email,
                    authKey: users[0].authKey
                }
            }
            return promiseError('ERROR_CREATING_USER');
        }, function (err) {
            //unique constraint on Email failed
            return promiseError('EMAIL_EXISTS');
        });
    },

    /**
     * Calculates hash for the incoming password
     * @param password Incoming password string
     * @returns String passwordHash
     */
    getUserPasswordHash = function (password) {
        var crypto = require('crypto'),
            hash = crypto.createHash('sha1');
        hash.update(password + passSalt);
        return hash.digest('hex');
    },

    /**
     * Logs in users
     * @param login Login (email, actually)
     * @param password Password
     * @returns Promise Resolves with user data object or rejects with error
     */
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

    /**
     * Get user data by user id
     * @param userId User ID
     * @returns Promise.<User>
     */
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

    /**
     * Gets the user data by authKey
     * @param authKey String authentication key for the API usage
     * @returns Promise.<User> User data (full)
     */
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

    /**
     * Creates a new filter link for the user (or returns an existing one, if the user already has one with the same URL)
     * @param userId ID of the user
     * @param url URL of the link to create
     * @returns Promise.<Link> Data object for the created or found link.
     */
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

    /**
     * The same as createLink, but suitable to the output (filters out all the service fields)
     * @param userId ID of the user
     * @param url Link URL
     * @returns Promise.<Link>
     */
    createLinkFiltered = function (userId, url) {
        return createLink(userId, url)
            .then(filterLinkOutput);
    },

    /**
     * Gets the link data by link ID (filtered output)
     * @param userId ID of the user
     * @param linkId Link ID in the DB
     * @returns Promise.<Link> Promise resolves with the link data
     */
    getLinkByIdFiltered = function (userId, linkId) {
        return getLinkById(userId, linkId)
            .then(filterLinkOutput);
    },


    /**
     * Removes the link from the DB. This will remove all the associated cars (cascade delete).
     * @param userId ID of the user
     * @param linkId Link ID
     * @returns Promise.<result> Resolves with {result} object, where result property contains 1 if the link was removed, 0 otherwise
     */
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

    /**
     * Changes sendMail property of the link. This property tells the system whether it should send the email when the associated cars' list of the link changes.
     * @param userId ID of the user
     * @param linkId ID of the link
     * @param sendMail True if the mail should be sent on cars list update, false otherwise. The value will have effect
     * @returns Promise.<Link> Promise will resolve with the link data (filtered)
     */
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

    /**
     * This function will find the link or create a new one, then add a new sequence to it.
     * @param userId ID of the user
     * @param url URL of the link
     * @returns Promise.<Link> Promise will resolve with the link data (full)
     */
    getLinkAndCreateSequence = function (userId, url) {
        return createLink(userId, url).then(function (link) {
            return createSequence(link.id).then(function (sequence) {
                console.log("Creating sequence %s", sequence.id);
                link.currentSequence = sequence.id;
                return link;
            });
        });
    },

    /**
     * Gets all the links for the desired user
     * @param userId ID of the user
     * @returns Promise<[Link]> Promise will resolve with the array of the links (full)
     */
    getLinks = function (userId) {
        //create without a check
        return models.link.findAll({
            where: {
                userId: userId
            }
        });
    },

    /**
     * Gets the link data by link ID (full output)
     * @param userId ID of the user
     * @param linkId Link ID in the DB
     * @returns Promise.<Link> Promise resolves with the link data or fails with link_not_found error
     */
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

    /**
     * Creates a new sequence for the link
     * @param linkId ID of the link
     * @returns Promise.<Sequence> Promise will resolve with the created sequence data (full)
     */
    createSequence = function (linkId) {
        return models.sequence.create({
            linkId: linkId
        });
    },

    /**
     * Updates the sequence when the parsing of the link finishes
     * @param sequenceId ID of the sequence
     * @param carsAdded Number of cars added to the link during this sequence
     * @param carsRemoved  Number of cars removed from the link during this sequence
     * @param carsNotChanged  Number of cars that didn't change during this sequence
     * @returns Promise.<Sequence> Promise will resolve with the sequence data (full)
     */
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

    /**
     * Gets all sequences for the link
     * @param userId ID of the user
     * @param linkId ID of the link
     * @returns Promise.<[Sequence]>  Promise will resolve with the array of the sequences (full)
     */
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

    getLinkCars = function (userId, linkId) {
        return models.link.findOne({
            where: {
                id: linkId,
                userId: userId,
            },
            include: [models.car]
        }).then(function (linkWithCars) {
            if (!linkWithCars) {
                return promiseError('LINK_NOT_FOUND');
            }
            if (linkWithCars.cars && linkWithCars.cars.length) {
                return linkWithCars.cars;
            }
            return promiseError('NO_CARS_FOUND');
        });
    },

    getLinkCarsRemoved = function (userId, linkId) {
        return models.link.findOne({
            where: {
                id: linkId,
                userId: userId,
            },
            include: [{
                model: models.sequence,
                order: 'id DESC',
                limit: 1
            }]
        }).then(function (link) {
                if (!link) {
                    return promiseError('LINK_NOT_FOUND');
                }
                var maxSequenceId = link.sequences[0];
                if (!maxSequenceId) {
                    return [];
                }
                return models.car.findAll({
                    where: {
                        linkId: link.id,
                        sequenceLastChecked: {
                            $lt: maxSequenceId.id
                        }
                    }
                });
            })
            .then(function (cars) {
                return cars;
            })
    },


    getAddedCarsForSequence = function (userId, linkId, sequenceId) {
        /*
        TODO: add userId check
         */
        return models.link.findOne({
            where: {
                id: linkId,
                userId: userId
            },
            include: [{
                model: models.sequence,
                where: {
                    id: sequenceId
                }
            }]
        }).then(function (link) {
                if (!link) {
                    return promiseError('LINK_NOT_FOUND');
                }
                var sequence = link.sequences[0];
                if (!sequence) {
                    return [];
                }
                return models.car.findAll({
                    where: {
                        linkId: link.id,
                        sequenceId: sequenceId
                    }
                });
            })
            .then(function (cars) {
                return cars;
            })
    },


    getRemovedCarsForSequence = function (userId, linkId, sequenceId) {
        /*
         TODO: add userId check
         */
        return models.link.findOne({
            where: {
                id: linkId,
                userId: userId
            },
            include: [{
                model: models.sequence,
                where: {
                    id: sequenceId
                }
            }]
        }).then(function (link) {
                if (!link) {
                    return promiseError('LINK_NOT_FOUND');
                }
                var sequence = link.sequences[0];
                if (!sequence) {
                    return [];
                }
                return models.car.findAll({
                    where: {
                        linkId: link.id,
                        sequenceLastChecked: parseInt(sequenceId)-1
                    }
                });
            })
            .then(function (cars) {
                return cars;
            })
    },

    /**
     * This will save the array of the found cars in the DB
     * @param carsInstancesArray Array of the found cars during the parsing sequence
     * @param link Link instance
     * @returns Promise.<{created: [], removed: [], notChanged: []}>  Promise will resolve with the object with 3 arrays for the created, removed, not changed cars accordingly.
     */
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

    /**
     * Saved one car in the DB. If the car already exists, updates its 'sequenceLastChecked' property.
     * @param carInstance Car instance from the parser
     * @returns Promise.<Car>  Promise will resolve with the car data (full)
     */
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

    /**
     * Initializes the parsing queue. This will use separate DB connection.
     * @param purgeDB If true, cleanup the DB on startup.
     * @returns Promise Promise will resolve with the array of the links added to the queue
     */
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

    /**
     * Starts the queue timer once the queue has been initialized
     * @returns queueIntervalTimer Timer handle to stop the queue if needed.
     */
    startQueue = function () {
        console.log("Queue started");
        queueCheckIntervalTimer = setInterval(checkQueue, queueCheckInterval);
        checkQueue();
        return queueCheckIntervalTimer;
    },

    /**
     * Stops the queue
     */
    stopQueue = function () {
        console.log("Queue stopped");
        return clearInterval(queueCheckIntervalTimer);
    },

    /**
     * Checks the queue each <interval> sec.
     * If it founds the links that has the right time to execute, it'll launch its execution process
     */
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

    /**
     * Executes the queue link (starts up the parser, then calculates next run date after the parser has completed the job)
     * @param link Link instance
     */
    executeQueueItem = function (link) {
        if (!link || !link.id) {
            return false;
        }
        if (!runningJob) {
            runningJob = link.id;
            return parser.process(link, getLinkAndCreateSequence, saveCars)
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

    /**
     * Moves the link to the front of the queue. The link will be executed during the next checkQueue event
     * @param link Link instance
     * @returns Promise<Link>
     */
    moveItemToQueueFront = function (link) {
        if (!link || !link.id) {
            return false;
        }

        link.nextRun = new Date();
        return link.save();
    },

    /**
     * Moves the link to the front of the queue, using its ID.
     * @param userId ID of the user
     * @param linkId ID of the link
     * @returns Promise.<Link> Promise will resolve with the link data (filtered)
     */
    runLinkById = function (userId, linkId) {
        return getLinkById(userId, linkId)
            .then(moveItemToQueueFront)
            .then(filterLinkOutput);
    },

    /**
     * Simply filters the output fields of the link
     * @param link
     * @returns {{id, url, sendMail}}
     */
    filterLinkOutput = function (link) {
        return {
            id: link.id,
            url: link.link,
            sendMail: link.sendMail
        };
    },

    /**
     * Simple promise rejector with the desired reason
     * @param errText Rejection reason
     * @returns Promise<errText> Returns a REJECTED promise with the error object
     */
    promiseError = function (errText) {
        return Promise.reject({error: errText});
    };

module.exports = {
    startup: startup,
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
    getUserByAuthKey: getUserByAuthKey,
    getLinkCars: getLinkCars,
    getLinkCarsRemoved: getLinkCarsRemoved,
    getAddedCarsForSequence: getAddedCarsForSequence,
    getRemovedCarsForSequence: getRemovedCarsForSequence
};