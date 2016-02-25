"use strict";

module.exports = (function () {
    var parser = require('./parser.js'),
        db = require('./db.js'),

        processUrl = function (url) {
            //Step 1. Check if the DB actually has the link. If
            return db.incrementLink(url)
                .then(function (link) {
                    return parser.process(url).then(function (items) {
                        //append linkId to each of the items
                        items.forEach(function (item) {
                            item['linkId'] = link.id;
                            item['sequenceChecked'] = link.sequenceId;
                        });
                        console.log(items[0], link);
                        return db.saveCars(items).then(function (newOnesArray) {
                            console.log("Query found %s new cars", newOnesArray.length, newOnesArray);
                            return newOnesArray;
                        });
                    });
                });
        };

    return {
        processUrl: processUrl
    };

})();
/**
 * Created by Wain on 24.02.2016.
 */
