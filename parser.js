"use strict";

module.exports = (function () {
    var _page, _phantom,
        totalItems,
        totalItemsCounter,
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
            totalItems = {};
            totalItemsCounter = 0;
            currentPage = 1;
            return getLink(userId, url).then(function (link) {
                return createPage()
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
         * Creates the PtantomJS page
         */
        createPage = function () {
            if (_phantom) {
                if (_page) {
                    return _page
                }
                else {
                    return phantom.createPage()
                        .then(function (page) {
                            return _page = page;
                        });
                }
            }

            return require('phantom').create()
                //create new Phantom page
                .then(function (phantom) {
                    _phantom = phantom;
                    return phantom.createPage();
                })
                .then(function (page) {
                    return _page = page;
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
                .then(function (output) {
                    console.log("Page found %s items", output.cars.length);
                    output.cars.forEach(function (item) {
                        if (!totalItems[item.id]) {
                            totalItemsCounter++;
                        }
                        totalItems[item.id] = item;
                    });
                    return output.pager;
                })
                .then(function (pager) {
                    if (pager && pager.current < pager.max) {
                        //wait 1 sec before opening the next page
                        //opening the pages too quickly can result in a BAN. We don't want a ban really
                        return promiseTimeout(1000).then(function () {
                            return processPages(createUrl(url, pager.current + 1));
                        });
                    }
                    console.log("Parser found %s cars", totalItemsCounter);
                    return totalItems;
                });
        },

        processPage = function (url, pageNum) {
            if (!pageNum) {
                pageNum = 1;
            }
            url = createUrl(url, pageNum);
            return _page.open(url)
                .then(parsePage)
                .then(function (output) {
                    var carsIds = Object.keys(output.cars);
                    console.log("Page found %s items", carsIds.length);
                    //this is a hack. Old cars are being shown
                    return promiseTimeout(2000).then(function () {
                        return output;
                    });
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
                    i, length, item, itemUrl, itemImages, id,
                    output = {
                        cars: {},
                        pager: {}
                    };
                length = list.length;
                for (i = 0; i < length; i++) {
                    item = list[i];
                    if (item.dataset && item.dataset.bem) {
                        itemUrl = item.querySelector('.listing-item__link');
                        itemImages = Array.prototype.slice.call(item.querySelectorAll('.brazzers-gallery__image'));
                        if (itemUrl) {
                            itemUrl = itemUrl.getAttribute('href');
                        }

                        if (itemImages && itemImages.length) {
                            itemImages = itemImages.reduce(function (array, image) {
                                var imgArr;
                                if (image.dataset.original) {
                                    imgArr = image.dataset.original.split('/');
                                    imgArr = imgArr.slice(2, imgArr.length - 1);
                                    array.push(imgArr.join('/'));
                                }
                                return array;
                            }, []);
                        }

                        item = JSON.parse(item.dataset.bem);
                        item = item['stat']['statParams'];
                        id = parseInt(item['card_id'], 10);
                        output.cars[id] = {
                            id: id,
                            url: itemUrl,
                            images: itemImages,
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
                        };
                    }
                }


                var pager = document.querySelector('.pager');
                if (pager && pager.dataset.bem) {
                    output.pager = JSON.parse(pager.dataset.bem).pager;
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
        process: process,
        processPage: processPage,
        createPage: createPage,
        closePage: closePage
    };

})();