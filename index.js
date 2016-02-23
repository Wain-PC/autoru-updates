"use strict";

var p = require('./parser.js');
p.getPage().then(function(page) {
    return p.parsePage(page);
});