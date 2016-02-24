"use strict";

var p = require('./parser.js');
var db = require('./db.js');

//тестовый URL
var url = 'http://auto.ru/cars/honda/accord/7156482/all/?listing=listing&sort_offers=cr_date-DESC&top_days=off&currency=RUR&output_type=list&km_age_to=100+000+%D0%BA%D0%BC&page_num_offers=1';

p.getPage(url).then(function(page) {
    return p.parsePage(page).then(function (items) {
        return db.startup().then(function () {
            db.saveCars(items);
        });
    })
});

/*db.startup(true).then(function () {
    console.log("Created and connected!");
})*/
