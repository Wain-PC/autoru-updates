"use strict";

module.exports = (function () {
    var _page, _phantom;

    var getPage = function () {
        return require('phantom').create().then(function (phantom) {
                _phantom = phantom;
                return phantom.createPage();
            })
            .then(function (page) {
                _page = page;
                return page.open('http://auto.ru/cars/honda/accord/7156482/all/?listing=listing&sort_offers=cr_date-DESC&top_days=off&currency=RUR&output_type=list&km_age_to=100+000+%D0%BA%D0%BC&page_num_offers=1')
            })
            .then(function () {
                return _page;
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

    var parsePage = function (page) {
        return page.evaluate(function () {
            var list = document.querySelectorAll('tbody.listing-item');
            var i, length, item, output = [];
            length = list.length;
            for (i = 0; i < length; i++) {
                item = list[i];
                if(item.dataset && item.dataset.bem) {
                    output.push(JSON.parse(item.dataset.bem));
                }
            }
            return output;
        }).then(function (list) {
            //process next pages
            //TODO: Step 1. Simulate scrolling to bottom of the page before pressing the next button (some logs are being sent while scrolling)
            // Step 2. Press Next page button (document.querySelector'.pager__next')) then wait ~1 sec while the info is being loaded
            // Step 3. Parse the info
            // Step 4. Repeat (check for stopping before that: Next page button should have a class of 'button_disabled')
            // Step 5. Analyze the info, save results to DB, send notifications, etc.

            console.log(list[10]);
            return list;
        });
    };

    return {
        getPage: getPage,
        closePage: closePage,
        parsePage: parsePage
    };

})();