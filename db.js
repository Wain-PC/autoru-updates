"use strict";

module.exports = (function () {
    var Sequelize = require("sequelize"),
        sequelize,
        dbPath = './database_test.sqlite',
        models = {
            car: null,
            link: null
        };

    var connect = function () {
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
    };

    var createModels = function (withClear) {
        models.link = sequelize.define('link', {
            link: {
                type: Sequelize.STRING
            }
        });

        models.car = sequelize.define('car', {
            id: {
                type: Sequelize.BIGINT,
                primaryKey: true
            },

           url: {
                type: Sequelize.STRING(1000),
                primaryKey: true
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

            archived: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            }
        });

        //define many-to-one relationship
        models.car.belongsTo(models.link);

        return Promise.all([models.link.sync({force: !!withClear}), models.car.sync({force: !!withClear})]);
    };

    var startup = function (purgeDB) {
        connect();
        return createModels(!!purgeDB);
    };

    var saveLink = function (linkInstance) {
        //create without a check
        return models.link.create({
            url: linkInstance.url
        });
    };

    var saveCars = function (carsInstancesArray) {
        var i, length, promisesArray = [];

        if (!(carsInstancesArray instanceof Array)) {
            return false;
        }
        i = 0;
        length = carsInstancesArray.length;

        for (i; i < length; i++) {
            promisesArray.push(saveCar(carsInstancesArray[i]));
        }
        return Promise.all(promisesArray);
    };

    var saveCar = function (carInstance) {
        return models.car.findOne({
            where: {
                id: carInstance.id
            }
        }).then(function (savedCar) {
            if (savedCar) {
                //tell that the car has been already saved
                //console.log('Got already saved car:', savedCar.dataValues.id);
                return savedCar.dataValues;
            }
            else {
                //save new car
                //console.log('Saving a new car:', carInstance.id);
                return models.car.create(carInstance).catch(function (err) {
                    console.error("Error creating a car:", err);
                });
            }
        });


    };

    return {
        startup: startup,
        saveCars: saveCars,
        saveCar: saveCar,
        saveLink: saveLink
    };

})();