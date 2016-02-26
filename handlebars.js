var handlebars = require('handlebars'),
    fs = require('fs');

module.exports = function (templateUrl, data) {
    fs.readFile(templateUrl, 'utf-8', function(error, source){
        if(error) {
            return "Page error =(";
        }
        return handlebars.compile(source)(data);
    });
};