"use strict";

var config = require("config").get('config'),
    Sequelize = require("sequelize"),
    parser = require('./parser.js'),
    sequelize,
    models = {},
    runningJob = null,
//check queue every 5 seconds
    queueCheckInterval = config.performance.queueCheckInterval,
    queueCheckIntervalTimer = null,
    passSalt = config.db.salt,

    /**
     * Connects to the DB (sqlite@localhost)
     * @returns sequelize instance
     */
    connect = function () {
        sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
            host: config.db.host,
            dialect: config.db.dialect,
            pool: config.db.pool,
            storage: config.db.path,
            logging: config.db.logging
        });
        return sequelize;
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
            status: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            telegramChatId: {
                type: Sequelize.STRING(100)
            }
        });


        models.link = sequelize.define('link', {
            link: {
                type: Sequelize.STRING
            },
            runPeriod: {
                type: Sequelize.INTEGER,
                defaultValue: config.performance.defaultRunPeriod
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
            linkId: {
                type: Sequelize.INTEGER
            },
            carsAdded: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            }
        });

        models.image = sequelize.define('image', {
            url: {
                type: Sequelize.STRING
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


            mark: {
                type: Sequelize.STRING
            },

            model: {
                type: Sequelize.STRING
            },

            description: {
                type: Sequelize.STRING(200)
            },

            year: {
                type: Sequelize.INTEGER
            },

            price: {
                type: Sequelize.INTEGER
            },

            run: {
                type: Sequelize.INTEGER
            },

            city: {
                type: Sequelize.STRING(100)
            },

            autoCodeChecked: {
                type: Sequelize.BOOLEAN
            },

            sequenceCreated: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },

            sequenceLastChecked: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            }
        });

        models.telegramQueue = sequelize.define('telegram', {
            sequenceId: {
                type: Sequelize.INTEGER,
                primaryKey: true //assuming we push notifications about each sequence only once
            }
        });

        //define many-to-one relationships
        //-----USER->LINK
        models.link.belongsTo(models.user, {
            onDelete: 'cascade'
        });
        models.user.hasMany(models.link);

        //-----LINK->SEQUENCE
        models.sequence.belongsTo(models.link, {
            onDelete: 'cascade'
        });
        models.link.hasMany(models.sequence);

        //---LINK->CAR
        models.car.belongsTo(models.link, {
            onDelete: 'cascade'
        });
        models.link.hasMany(models.car);


        models.image.belongsTo(models.car, {
            onDelete: 'cascade'
        });
        models.car.hasMany(models.image);

        models.telegramQueue.belongsTo(models.sequence, {
            onDelete: 'cascade'
        });
        models.sequence.hasMany(models.telegramQueue, {as: 'telegramQueue'});

        for (modelName in models) {
            if (models.hasOwnProperty(modelName)) {
                syncModelPromise = syncModelPromise.then((function (modelName) {
                    return function () {
                        return models[modelName].sync({force: (!!withClear && modelName !== 'user')});
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
        var connection = connect();
        return createModels(!!purgeDB).then(function () {
            return {connection: connection};
        })
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
        }).then(function (user) {
            if (user) {
                user = user.get();
                return {
                    id: user.id,
                    email: user.email,
                    authKey: user.authKey
                }
            }
            return promiseError('ERROR_CREATING_USER');
        }, function (err) {
            //unique constraint on Email failed
            return promiseError('LOGIN_EXISTS');
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
            attributes: ['id', 'email', 'authKey']
        }).then(function (user) {
            return user || promiseError('AUTH_FAIL');
        });
    },

    /**
     * Get user data by custom properties
     * @param props Properties object for applying in WHERE SQL query
     * @returns Promise.<User>
     */
    getUserBy = function (props) {
        return models.user.findOne({
            where: props
        }).then(function (user) {
            if (user) {
                return user.get();
            }
            return promiseError('USER_NOT_FOUND');
        });
    },

    /**
     * Saves telegram chat ID for the user
     * @param userId User ID
     * @param telegramChatId Telegram Chat ID
     * @param telegramUserId Telegram User ID
     * @returns Promise.<Boolean> True if chatId has been added sucessfully, false otherwise
     */
    addUserTelegramChat = function (userId, telegramChatId, telegramUserId) {
        var _user;
        //user ID cannot be zero(0), so it's a perfectly valid check
        if (!userId) {
            return promiseError('NO_USERID');
        }
        if (!telegramChatId) {
            return promiseError('NO_TELEGRAM_CHAT_ID');
        }
        return models.user.findOne({
            where: {
                id: userId
            }
        }).then(function (user) {
            if (user) {
                if (user.telegramChatId) {
                    return promiseError('TELEGRAM_CHAT_ALREADY_STARTED');
                }
                _user = user;
                return checkDuplicateTelegramAccounts(telegramUserId);
            }
            return promiseError('USER_NOT_FOUND');
        })
            .then(function (duplicateCheckResult) {
                if (duplicateCheckResult) {
                    return promiseError("MULTIPLE_ACCOUNTS_CHAT");
                }
                _user.telegramChatId = telegramChatId;
                return _user.save();
            })
            .then(function (user) {
                return !!(user && user.telegramChatId) || promiseError("ERR_ADDING_TELEGRAM_CHAT");
            });
    },

    /**
     * Checks for the same user trying to get notifications from many accounts. Such user must be banned.
     * @param telegramUserId Telegram User ID
     * @returns Promise.<Boolean> True if duplicate user detected, false otherwise
     */
    checkDuplicateTelegramAccounts = function (telegramUserId) {
        if (!telegramUserId) {
            return promiseError('TELEGRAM_USERID_NOT_PROVIDED');
        }
        return models.user.findOne({
            where: {
                telegramChatId: telegramUserId
            }
        })
            .then(function (user) {
                return !!user;
            })
    },

    /**
     * Removes telegram chat ID for the user
     * @param userId User ID
     * @returns Promise.<Boolean> True if chatId has been removed sucessfully, false otherwise
     */
    removeUserTelegramChat = function (userId) {
        if (userId === undefined) {
            return promiseError('NO_USERID');
        }
        return models.user.findOne({
            where: {
                id: userId
            }
        }).then(function (user) {
            if (user) {
                if (!user.telegramChatId) {
                    return promiseError("TELEGRAM_CHAT_NOT_FOUND");
                }
                user.telegramChatId = null;
                return user.save();
            }
            return promiseError('USER_NOT_FOUND');
        })
            .then(function (user) {
                return !!(user && !user.telegramChatId) || promiseError("ERR_DELETING_TELEGRAM_CHAT");
            });
    },

    /**
     * Creates a new filter link for the user (or returns an existing one, if the user already has one with the same URL)
     * @param userId ID of the user
     * @param url String URL of the link to create
     * @param sendMail Boolean if true, notifications will be send on updates
     * @returns Promise.<Link> Data object for the created or found link.
     */
    createLink = function (userId, url, sendMail) {
        if (!userId || !url) {
            return promiseError('NO_USERID_OR_URL');
        }

        if (sendMail === undefined) {
            sendMail = true;
        }

        return getUserBy({id: userId}).then(function (user) {
            //TODO: add check whether a user can create new link or not (linkLimit, demoMode or something)
            return models.link.findOrCreate({
                where: {
                    link: url,
                    userId: user.id
                },
                defaults: {
                    link: url,
                    userId: user.id,
                    nextRun: new Date(),
                    sendMail: !!sendMail
                }
            })
                .then(function (links) {
                    return links[0];
                });
        });
    },

    /**
     * The same as createLink, but suitable to the output (filters out all the service fields)
     * @param userId Number ID of the user
     * @param url String Link URL
     * @param sendMail Boolean if true, notifications will be send on updates
     * @returns Promise.<Link>
     */
    createLinkFiltered = function (userId, url, sendMail) {
        return createLink(userId, url, sendMail)
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
     * Updates link params in the DB.
     * @param userId ID of the user
     * @param linkId Link ID
     * @param runPeriod Update period of the link
     * @param sendMail If true, send notifications when new cars arrive
     * @returns Promise.<result> Resolves with {result} object, where result property contains true if the link has been updated, false otherwise
     */
    updateLink = function (userId, linkId, runPeriod, sendMail) {
        console.log(runPeriod, sendMail);
        return getUserBy({id: userId}).then(function (user) {
            return models.link.update(
                {
                    runPeriod: runPeriod,
                    sendMail: !!sendMail
                },
                {
                    where: {
                        id: linkId,
                        userId: user.id
                    }
                }).then(function (result) {
                return {
                    result: !!result
                }
            })
        });
    },

    /**
     * Removes the link from the DB. This will remove all the associated cars (cascade delete).
     * @param userId ID of the user
     * @param linkId Link ID
     * @returns Promise.<result> Resolves with {result} object, where result property contains 1 if the link was removed, 0 otherwise
     */
    removeLink = function (userId, linkId) {
        return getUserBy({id: userId}).then(function (user) {
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
        return getUserBy({id: userId}).then(function (user) {
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
        return createLink(userId, url)
            .then(function (link) {
                return createSequence(link.id)
                    .then(function (sequence) {
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
     * @returns Promise.<Sequence> Promise will resolve with the sequence data (full)
     */
    updateSequence = function (sequenceId, carsAdded) {
        return models.sequence.update({
            carsAdded: +carsAdded || 0
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
            include: [models.sequence],
            order: [[models.sequence, 'updatedAt', 'DESC']]
        }).then(function (link) {
            if (!link) {
                return promiseError('LINK_NOT_FOUND');
            }
            if (link.sequences && link.sequences.length) {
                return link.sequences;
            }
            return [];
        });
    },

    getLinkCars = function (userId, linkId) {
        return models.link.findOne({
            where: {
                id: linkId,
                userId: userId
            },
            include: [{
                model: models.car,
                include: [models.image]
            }]
        }).then(function (linkWithCars) {
            if (!linkWithCars) {
                return promiseError('LINK_NOT_FOUND');
            }
            if (linkWithCars.cars && linkWithCars.cars.length) {
                return linkWithCars.cars;
            }
            return [];
        });
    },


//TODO: possible security issue: one can watch other user's cars, not only that belong to himself
    getCarById = function (userId, carId) {
        return models.car.findOne({
            where: {
                id: carId
            },
            include: [{
                model: models.image
            }]
        }).then(function (car) {
            if (!car) {
                return promiseError('CAR_NOT_FOUND');
            }
            return car;
        });
    },


    getAddedCarsForSequence = function (userId, linkId, sequenceId) {
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
                    sequenceCreated: sequenceId
                },
                include: [models.image]
            });
        })
    },


    /**
     * This will save the array of the found cars in the DB
     * @param cars Array of the found cars during the parsing sequence
     * @param link Link instance
     * @returns Promise.<{Array>  Promise will resolve with the array of created cars.
     */
    saveCars = function (cars, link) {
        var carId, car,
            linkId, outObj = [],
            carsArray = [],
            ids = [],
            images = [];


        linkId = link.id;

        for (carId in cars) {
            if (cars.hasOwnProperty(carId)) {
                ids.push(carId);
            }
        }

        //update all existing cars with latest sequenceLastChecked
        return models.car.update(
            {sequenceLastChecked: link.currentSequence},
            {
                where: {
                    id: {
                        $in: ids
                    },
                    linkId: linkId
                }
            })
        //after that, we should find the cars updated and remove it from the DB
            .then(function () {
                return models.car.findAll({
                    where: {
                        linkId: linkId,
                        sequenceLastChecked: link.currentSequence
                    },
                    raw: true
                }).then(function (carsFound) {
                    //console.log('Found %s updated cars', carsFound.length);
                    carsFound.forEach(function (car) {
                        if (cars[car.id]) {
                            //console.log('Deleting found car %s', car.id);
                            delete cars[car.id]
                        }
                    });

                    ids = [];
                    images = [];
                    for (carId in cars) {
                        if (cars.hasOwnProperty(carId)) {
                            cars[carId]['linkId'] = link.id;
                            cars[carId]['sequenceCreated'] = link.currentSequence;
                            cars[carId]['sequenceLastChecked'] = link.currentSequence;
                            carsArray.push(cars[carId]);
                            ids.push(carId);
                            cars[carId].images.forEach(function (imageUrl) {
                                images.push({
                                    carId: carId,
                                    url: imageUrl
                                });
                            });
                        }
                    }
                    //console.log("Found %s cars not yet created", carsArray.length);


                });
            })
            //after that, bulk create all other cars
            .then(function () {
                return models.car.bulkCreate(carsArray).then(function () {
                    return models.image.bulkCreate(images);
                });
            })
            .then(function () {
                return models.car.findAll({
                    where: {
                        linkId: link.id
                    }
                }).then(function (cars) {
                    var i, length;
                    length = cars.length;
                    for (i = 0; i < length; i++) {

                        //that means the car has been added during the last sequence (it's new)
                        if (link.currentSequence === cars[i].sequenceCreated) {
                            outObj.push(cars[i].get());
                        }
                    }
                    //save stats to the sequence
                    return updateSequence(link.currentSequence, outObj.length)
                        .then(function () {
                            return outObj;
                        });
                })
            })
            .catch(function (err) {
                return outObj;
            });
    },

    /**
     * All-new, fast saver
     * @param cars Object Cars object from the parser
     * @param link Link Link to append cars to
     * @returns Integer Number of new cars saved to the DB
     */
    saveCarsFast = function (cars, link) {
        var carId, car,
            linkId,
            carsArray = [],
            ids = [],
            images = [];

        linkId = link.id;

        for (carId in cars) {
            if (cars.hasOwnProperty(carId)) {
                ids.push(carId);
            }
        }

        //update all existing cars with latest sequenceLastChecked
        return models.car.update(
            {sequenceLastChecked: link.currentSequence},
            {
                where: {
                    id: {
                        $in: ids
                    },
                    linkId: linkId
                }
            })
        //after that, we should find the cars updated and remove it from the DB
            .then(function () {
                return models.car.findAll({
                    where: {
                        linkId: linkId,
                        sequenceLastChecked: link.currentSequence
                    },
                    raw: true
                }).then(function (carsFound) {
                    //console.log('Found %s updated cars', carsFound.length);
                    carsFound.forEach(function (car) {
                        if (cars[car.id]) {
                            //console.log('Deleting found car %s', car.id);
                            delete cars[car.id]
                        }
                    });

                    ids = [];
                    images = [];
                    for (carId in cars) {
                        if (cars.hasOwnProperty(carId)) {
                            cars[carId]['linkId'] = link.id;
                            cars[carId]['sequenceCreated'] = link.currentSequence;
                            cars[carId]['sequenceLastChecked'] = link.currentSequence;
                            carsArray.push(cars[carId]);
                            ids.push(carId);
                            cars[carId].images.forEach(function (imageUrl) {
                                images.push({
                                    carId: carId,
                                    url: imageUrl
                                });
                            });
                        }
                    }
                    console.log("Found %s cars not yet created", carsArray.length);


                });
            })
            //after that, bulk create all other cars
            .then(function () {
                return models.car.bulkCreate(carsArray).then(function () {
                    return models.image.bulkCreate(images);
                });
            })
            .then(function () {
                return carsArray.length;
            })
            .catch(function (err) {
                console.error(err, err.stack);
                return 0;
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
                        link.nextRun = new Date(nowTime + index * 1000 * queueCheckInterval);
                        promisesArray.push(link.save());
                    });
                    return Promise.all(promisesArray);
                })
                .then(function () {
                    queueCheckIntervalTimer = setInterval(checkQueue, 1000 * queueCheckInterval);
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
        queueCheckIntervalTimer = setInterval(checkQueue, 1000 * queueCheckInterval);
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
            //console.log("Check queue found latest link:", link.id, link.nextRun, link.nextRun.getTime());
            if (!link.nextRun || link.nextRun.getTime() < nowTime) {
                return executeQueueItemFast(link);
            }
            return false;
        });
    },

    crawlPage = function (link, pageNum, totalCars) {
        var maxPage, carsCount;
        if (!pageNum) {
            pageNum = 1;
        }
        if (!totalCars) {
            totalCars = 0;
        }
        console.log("Crawling page %s (%s found previously)", pageNum, totalCars);
        return parser.processPage(link.link, pageNum)
            .then(function (output) {
                console.log("OUT:", JSON.stringify(output));
                maxPage = output.pager && output.pager.max;
                carsCount = Object.keys(output.cars).length;
                return saveCarsFast(output.cars, link);
            })
            .then(function (newCarsCount) {
                totalCars += newCarsCount;
                console.log("MaxPage: %s PageNum: %s PageCars: %s NewCars: %s", maxPage, pageNum, carsCount, newCarsCount);
                //beware of the MAGIC constant. It's the number of cars on one page
                if (newCarsCount === 37) {
                    console.log("Move to next page");
                    return crawlPage(link, ++pageNum, totalCars);
                }
                //repeat if that's NOT the last page, 0 is probably an error
                else if (maxPage && carsCount === 0 && pageNum < maxPage) {
                    console.log("Repeat the page, probably an error");
                    return crawlPage(link, pageNum, totalCars);
                }
                console.log("All done, new cars found:", totalCars);
                return totalCars;
            });
    },


    executeQueueItemFast = function (link) {
        if (!link || !link.id) {
            return false;
        }
        if (!runningJob) {
            runningJob = link.id;
            return getLinkAndCreateSequence(link.userId, link.link)
                .then(function (newLink) {
                    link = newLink;
                })
                .then(parser.createPage)
                .then(function () {
                    return crawlPage(link);
                })
                .then(function (newCarsCounter) {
                    console.log("Update sequence now!");
                    return updateSequence(link.currentSequence, newCarsCounter);
                })

                .then(function () {
                    //update nextRun of the link
                    var nowTime = new Date().getTime();

                    if (!link.runPeriod) {
                        link.runPeriod = config.performance.defaultRunPeriod;
                    }

                    link.nextRun = new Date(nowTime + link.runPeriod * 60000);

                    console.log("NextRun assigned to %s", link.runPeriod, link.nextRun);
                    return link.save().then(function () {
                        runningJob = false;
                        return checkQueue();
                    })
                })
                .then(parser.closePage);
        }
    },


    getLatestAddedCarsForAllLinks = function (userId, limit) {
        //Step 1. Get all links for the user
        //Step 2. Get ID's of this links.
        //Step 3. Search for cars with this linkID's, order by 'created' or 'createdAt'
        return models.link.findAll({
            where: {
                userId: userId
            }
        }).then(function (links) {
            var ids = links.map(function (link) {
                return link.id;
            });
            return models.car.findAll({
                where: {
                    linkId: {
                        $in: ids
                    }
                },
                include: [models.image],
                order: [['createdAt', 'DESC']],
                limit: limit || config.limits.latest
            })
        });
    },

    getLatestAddedCarsForLink = function (userId, linkId) {
        //Step 1. Check whether this link belongs to the user.
        //Step 2. Search for cars with the given linkId, order by 'created' or 'createdAt'
        return models.link.findOne({
            where: {
                userId: userId,
                id: linkId
            }
        }).then(function (link) {
            if (!link) {
                return [];
            }
            return models.car.findAll({
                where: {
                    linkId: link.id
                },
                include: [models.image],
                order: [['createdAt', 'DESC']],
                limit: config.limits.added
            })
        })
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
            sendMail: link.sendMail,
            runPeriod: link.runPeriod
        };
    },

    /**
     * Simple promise rejector with the desired reason
     * @param errText Rejection reason
     * @returns Promise<errText> Returns a REJECTED promise with the error object
     */
    promiseError = function (errText) {
        return Promise.reject({error: errText});
    },

    telegramQueuePush = function (sequenceId) {
        return models.sequence.findOne({
            where: {
                id: sequenceId
            }
        })
            .then(function (sequence) {
                if (!sequence) {
                    return promiseError('SEQUENCE_NOT_FOUND');
                }
                return models.telegramQueue.create({
                    sequenceId: sequenceId
                })
            })

    },

    telegramQueuePop = function (sequenceId) {
        return models.telegramQueue.findOne({
            where: {
                sequenceId: sequenceId
            },
            include: [models.sequence]
        }).then(function (queueItem) {
            if (queueItem === null) {
                return promiseError('QUEUE_ITEM_NOT_FOUND');
            }
            if (!(queueItem.sequences && queueItem.sequences.length)) {
                return promiseError('SEQUENCE_NOT_FOUND');
            }

            return queueItem.sequences[0];
        })
            .then(function (sequence) {
                return models.car.findAll({
                    where: {
                        linkId: sequence.linkId,
                        sequenceCreated: sequence.id
                    },
                    include: [models.image]
                });
            });
    };

module.exports = {
    startup,
    link: {
        create: createLinkFiltered,
        get: getLinkByIdFiltered,
        getAll: getLinks,
        getSequences: getLinkSequences,
        run: runLinkById,
        update: updateLink,
        remove: removeLink,
        sendMail: sendMailToLink,
        getCars: getLinkCars,
        getLatestCars: getLatestAddedCarsForLink
    },
    queue: {
        init: initQueue,
        check: checkQueue,
        start: startQueue,
        stop: stopQueue
    },
    car: {
        get: getCarById,
        getLatest: getLatestAddedCarsForAllLinks
    },
    sequence: {
        getCars: getAddedCarsForSequence
    },
    user: {
        get: getUserBy,
        create: createUser,
        authenticate: authenticateUser
    },
    telegram: {
        addChat: addUserTelegramChat,
        removeChat: removeUserTelegramChat,
        push: telegramQueuePush,
        pop: telegramQueuePop
    }
};