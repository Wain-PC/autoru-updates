"use strict";

module.exports = (function () {
    var _page, _phantom,
        remotePageLoadResolve,
        remotePageLoadReject,

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
                            //register onLoadFinished handler
                            console.log("OnLoadFinished listener registered");
                            page.on('onLoadFinished', function (status) {
                                console.log("obLoadFinished handler:"+status);
                                if(status === 'success') {
                                    return parsePage()
                                        .then((result)=>{
                                            return remotePageLoadResolve(result);
                                        }, function (err) {
                                            return remotePageLoadReject(err);
                                        });
                                }
                                return remotePageLoadReject(status);
                            });

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
                    page.on('onLoadFinished', function (status) {
                        console.log("obLoadFinished handler:"+status);
                        if(status === 'success') {
                            return parsePage()
                                .then((result)=>{
                                    return remotePageLoadResolve(result);
                                }, function (err) {
                                    return remotePageLoadReject(err);
                                });
                        }
                        return remotePageLoadReject(status);
                    });
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
            console.log(url);
            return _page.open(url)
                .then(function (status) {
                    console.log("Page open handler:"+status);
                    if(status === 'success') {
                        return new Promise((resolve, reject)=>{
                            remotePageLoadResolve = resolve;
                            remotePageLoadReject = reject;
                        });
                    }
                    return Promise.reject();
                })
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
            console.log("Page parser started, evaluating script");
            return _page.evaluate(function () {
                console.log("Hello from the inside!");
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

                        id = parseInt(JSON.parse(item.dataset.bem)['stat']['id'], 10); //such bad code, wow
                        output.cars[id] = {
                            id: id,
                            url: itemUrl,
                            images: itemImages
                        };

                        //this is the tricky part. Since Yandex devs disabled the pretty JSON in their output,
                        //we'll have to parse the page itself. This is the hacky way, but it'll do for now.
                        var props = [
                            {
                                orig: 'name',
                                out: 'mark'
                            },
                            {
                                orig: 'description',
                                out: 'description'
                            },
                            {
                                orig: 'price',
                                out: 'price'
                            }
                            ,
                            {
                                orig: 'year',
                                out: 'year'
                            },
                            {
                                orig: 'km',
                                out: 'run'
                            },
                            {
                                orig: 'autocode',
                                out: 'model'
                            }
                        ];
                        props.forEach(function (obj, index) {
                            console.log(obj);
                            var query = item.querySelector(".listing-item__" + obj.orig);
                            console.log(query);
                            if (query) {
                                output.cars[id][obj.out] = query.innerText || null;
                            }
                            else {
                                output.cars[id][obj.out] = null;
                            }
                        });

                        //strip autocode from name
                        if (output.cars[id].mark && output.cars[id].model) {
                            output.cars[id].mark = output.cars[id].mark.split(output.cars[id].km)[0];
                        }

                        //make a number out of the price
                        //Step 1. Remove spaces
                        //Step 2. Parse to Integer
                        if (output.cars[id].price) {
                            output.cars[id].price = parseInt(output.cars[id].price.replace(/ /g, ''));
                        }
                        //the same applies to 'run' property
                        if (output.cars[id].run) {
                            output.cars[id].run = parseInt(output.cars[id].run.replace(/ /g, ''));
                        }

                        console.log(id, output.cars[id]);
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