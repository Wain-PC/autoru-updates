"use strict";

module.exports = (function () {
    var Sequelize = require("sequelize"),
        sequelize,
        dbPath = './database_test.sqlite',
        models = {
            car: null,
            link: null
        },

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

                sequenceId: {
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
        };

    return {};

})();