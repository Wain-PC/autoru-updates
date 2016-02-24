"use strict";

module.exports = (function () {
    var db = require('./db.js');
    var _page, _phantom;

    var process = function (url) {
        return require('phantom').create()
            //create new Phantom page
            .then(function (phantom) {
                _phantom = phantom;
                return phantom.createPage();
            })
            //open URL
            .then(function (page) {
                _page = page;
            })
            //parse the cars from URL
            .then(function () {
                return processPages(url);
            })
            .catch(function (err) {
                console.error("Caught Err:", err);
                closePage();
            });
    };

    var closePage = function () {
        if (_page) {
            _page.close();
        }
        if (_phantom) {
            _phantom.exit();
        }
    };

    /**
     * Processing the page. Will call next page if found.
     * process next pages
     * Step 1. Simulate scrolling to bottom of the page before pressing the next button (some logs are being sent while scrolling)
     * Step 2. Press Next page button (document.querySelector'.pager__next')) then wait ~1 sec while the info is being loaded
     * Step 3. Parse the info
     * Step 4. Repeat (check for stopping before that: Next page button should have a class of 'button_disabled')
     * Step 5. Analyze the info, save results to DB, send notifications, etc.
     */
    var totalItems = [],
        currentPage = 1,

        processPages = function (url) {
            return _page.open(url)
                .then(parsePage)
                .then(function (items) {
                    console.log("Got %s items", items.length);
                    totalItems = totalItems.concat(items);
                    return _page.evaluate(function () {
                        var pager = document.querySelector('.pager');
                        if (pager && pager.dataset.bem) {
                            pager = JSON.parse(pager.dataset.bem).pager;
                            currentPage = pager.current;
                            //we have more pages to go, create new URL and open it
                            if (currentPage < pager.max) {
                                return pager;
                            }
                        }
                        return false;

                    });
                })
                .then(function (pager) {
                    if (pager) {
                        return promiseTimeout(1000).then(function () {
                            return processPages(createUrl(url, pager.current + 1));
                        });
                    }
                    else {
                        console.log("Total:", totalItems.length);
                        return totalItems;
                    }
                });
        },

        createUrl = function (url, page) {
            url = url.split('&page_num_offers');
            url = url[0];
            url += '&page_num_offers=' + page;
            return url;
        },

        parsePage = function () {
            return _page.evaluate(function () {
                var list = document.querySelectorAll('tbody.listing-item'),
                    i, length, item, itemUrl, output = [];
                length = list.length;
                for (i = 0; i < length; i++) {
                    item = list[i];
                    if (item.dataset && item.dataset.bem) {
                        itemUrl = item.querySelector('.listing-item__link').getAttribute('href');
                        item = JSON.parse(item.dataset.bem);
                        item = item['stat']['statParams'];

                        output.push({
                            id: parseInt(item['card_id'], 10),
                            url: itemUrl,
                            created: new Date(item['card_date_created']),
                            updated: new Date(item['card_date_updated']),
                            mark: item['card_mark'],
                            model: item['card_model'],
                            generation: item['card_generation'],
                            gearbox: item['card_gearbox'],
                            year: item['card_year'],
                            owners: item['card_owners_count'],
                            price: item['card_price'],
                            run: item['card_run'],
                            condition: item['card_state'],
                            vin: item['card_vin'] === 'true',
                            checked: item['card_checked'] === 'true',
                            userId: parseInt(item['card_owner_uid'], 10)
                        });
                    }
                }
                return output;
            });
        },

        promiseTimeout = function (time) {
            return new Promise(function (resolve) {
                setTimeout(resolve, time);
            });
        };

    return {
        process: process
    };

})();