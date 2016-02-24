"use strict";

module.exports = (function () {
    var _page, _phantom;

    var getPage = function (url) {
        return require('phantom').create().then(function (phantom) {
                _phantom = phantom;
                return phantom.createPage();
            })
            .then(function (page) {
                _page = page;
                return page.open(url)
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
            var list = document.querySelectorAll('tbody.listing-item'),
                urls = document.querySelectorAll('.listing-item__link');
            var i, length, item, itemUrl, output = [];
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
        }).then(function (list) {
            //process next pages
            //TODO: Step 1. Simulate scrolling to bottom of the page before pressing the next button (some logs are being sent while scrolling)
            // Step 2. Press Next page button (document.querySelector'.pager__next')) then wait ~1 sec while the info is being loaded
            // Step 3. Parse the info
            // Step 4. Repeat (check for stopping before that: Next page button should have a class of 'button_disabled')
            // Step 5. Analyze the info, save results to DB, send notifications, etc.
            return list;
        });
    };

    return {
        getPage: getPage,
        closePage: closePage,
        parsePage: parsePage
    };

})();