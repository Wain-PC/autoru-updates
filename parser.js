"use strict";

module.exports = (function () {
    var _page, _phantom,
        totalItems,
        currentPage,
        /**
         * Core method to parse the page. It will do the parsing, then save them to DB.
         * @param link Link to parse
         * @param getLink Reference to db.getLink (requiring it here will cause a circular dependency)
         * @param saveCars Reference to db.saveCars method (for the same reason here as the previous param)
         * @returns Promise Promise will resolve with the object containing 3 properties (all of them are arrays filled with cars): created, removed, notChanged
         */
        process = function (link, getLink, saveCars) {
            var url = link.link,
                userId = link.userId;
            totalItems = [];
            currentPage = 1;
            return getLink(userId, url).then(function (link) {
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
                    })
                    .then(function (items) {
                        return saveCars(items, link);
                    })
                    .then(function (savedCars) {
                        console.log("Parser stats: %s/%s/%s (added/removed/not changed)", savedCars.created.length, savedCars.removed.length, savedCars.notChanged.length);
                        closePage();
                        return savedCars;
                    })
            })
        },

        /**
         * Closes the PtantomJS page
         */
        closePage = function () {
            if (_page) {
                _page.close();
            }
            if (_phantom) {
                _phantom.exit();
            }
        },

        /**
         */

        /**
         * Processes all the pages for the current filter - one by one
         * @description
         * Step 1. Simulate scrolling to bottom of the page before pressing the next button (some logs are being sent while scrolling)
         * Step 2. Press Next page button (document.querySelector'.pager__next')) then wait ~1 sec while the info is being loaded
         * Step 3. Parse the info (using parsePage method)
         * Step 4. Repeat (check for stopping before that: Next page button should have a class of 'button_disabled')
         * Step 5. Analyze the info, save results to DB, send notifications, etc.
         * @param url Filter URL
         * @returns Promise Promise will resolve with the array of cars found on all pages
         */
        processPages = function (url) {
            return _page.open(url)
                .then(parsePage)
                .then(function (items) {
                    console.log("Page found %s items", items.length);
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
                        //wait 1 sec before opening the next page
                        //opening the pages too quickly can result in a BAN. We don't want a ban really
                        return promiseTimeout(1000).then(function () {
                            return processPages(createUrl(url, pager.current + 1));
                        });
                    }
                    else {
                        console.log("Parser found %s cars", totalItems.length);
                        return totalItems;
                    }
                });
        },

        /**
         * Created URL for the next page
         * @param url URL for the current page
         * @param page Next page number
         * @returns {string} URL of the next page
         */
        createUrl = function (url, page) {
            url = url.split('&page_num_offers');
            url = url[0];
            url += '&page_num_offers=' + page;
            return url;
        },

        /**
         * Parses a single page and returns an array of found cars
         * @returns {Array}
         */
        parsePage = function () {
            return _page.evaluate(function () {
                var list = document.querySelectorAll('tbody.listing-item'),
                    i, length, item, itemUrl, output = [];
                length = list.length;
                for (i = 0; i < length; i++) {
                    item = list[i];
                    if (item.dataset && item.dataset.bem) {
                        itemUrl = item.querySelector('.listing-item__link');
                        if(itemUrl) {
                            itemUrl = itemUrl.getAttribute('href');
                        }
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

        /**
         * A simple wrapper for native setTimeout (kind of 'sleep' for JS code).
         * @param time Timeout time (in ms)
         * @returns Promise  Promise will resolve when the timeout's callback is executed
         */
        promiseTimeout = function (time) {
            return new Promise(function (resolve) {
                setTimeout(resolve, time);
            });
        };

    return {
        process: process
    };

})();