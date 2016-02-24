"use strict";

module.exports = (function () {
    var parser = require('./parser.js'),
        db = require('./db.js'),

        processUrl = function (url, purgeDB) {
        //Step 1. Start the DB.
        return db.startup(purgeDB).then(function () {
                //Step 2. Check whether the URL is already present in the DB
                return db.hasLink(url);
            })
            .then(function (link) {
                //Step 3. If the link is present, perform a full scan, then start diff analysis
                console.log("Has link: ", link);
                if (link) {
                    return parser.process(url).then(function (items) {
                        //append linkId to each of the items
                        items.forEach(function (item) {
                            item['linkId'] = link.id;
                        });
                        return db.saveCars(items).then(function (newOnesArray) {
                            console.log("Query received %s new items:", newOnesArray.length, newOnesArray);
                            return newOnesArray;
                        });
                    });
                }
                //Step 4. If there's no link, assume it's a new one, so diff analysis shouldn't start
                else {
                    return db.createLink(url).then(function (link) {
                        return parser.process(url).then(function (items) {
                            //append linkId to each of the items
                            items.forEach(function (item) {
                                item['linkId'] = link.id;
                            });
                            return db.saveCars(items).then(function (newOnesArray) {
                                console.log("Total of %s items received in the query", newOnesArray.length);
                                return newOnesArray;
                            });
                        });
                    });
                }
            });
    };

    return {
        processUrl: processUrl
    };

})();
/**
 * Created by Wain on 24.02.2016.
 */
