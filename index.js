"use strict";

var p = require('./processor.js'),
    url = 'http://auto.ru/cars/honda/accord/7156482/all/?listing=listing&sort_offers=cr_date-DESC&top_days=off&currency=RUR&output_type=list&km_age_to=100+000+%D0%BA%D0%BC&page_num_offers=1';

return p.processUrl(url, false).then(function () {
    process.exit(0);
}, function (err) {
    console.log("App error: ", err);
});
