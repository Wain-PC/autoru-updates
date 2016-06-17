"use strict";

module.exports = (function () {
    var _page, _phantom,

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

        processPage = function (url, pageNum) {
            if (!pageNum) {
                pageNum = 1;
            }
            url = createUrl(url, pageNum);
            return _page.open(url)
                .then(parsePage);
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
         * Parses a single page and returns an array of found cars (or false when it assumes the page is not a valid one)
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
                        id = parseInt(item['stat']['id'], 10);
                        output.cars[id] = {
                            id: id,
                            url: itemUrl,
                            images: itemImages
                        };
                    }
                }


                var pager = document.querySelector('.pager');
                if (pager && pager.dataset.bem) {
                    output.pager = JSON.parse(pager.dataset.bem).pager;
                }
                else {
                    //return empty cars object and no pager
                    return false;
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
        processPage: processPage,
        createPage: createPage,
        closePage: closePage
    };

})();