"use strict";

var db = require('./db.js'),
    url = 'http://auto.ru/cars/honda/accord/7156482/all/?listing=listing&sort_offers=cr_date-DESC&top_days=off&currency=RUR&output_type=list&km_age_to=100+000+%D0%BA%D0%BC&page_num_offers=1',
    urlbmw = 'http://auto.ru/cars/bmw/3er/3659007/used/?listing=listing&sort_offers=cr_date-DESC&top_days=off&currency=RUR&output_type=list&autoru_body_type%5B%5D=SEDAN&transmission_full%5B%5D=AUTO&transmission_full%5B%5D=AUTO_AUTOMATIC&transmission_full%5B%5D=AUTO_ROBOT&transmission_full%5B%5D=AUTO_VARIATOR&engine_type%5B%5D=GASOLINE&km_age_to=100+000+%D0%BA%D0%BC&page_num_offers=1';


return db.initQueue(false);
