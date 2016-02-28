var nodemailer = require('nodemailer'),
    hbs = require('./handlebars.js'),
    smtpConfig = {
        host: 'smtp.mail.ru',
        port: 465,
        secure: true, // use SSL
        auth: {
            user: 'bot@example.com',
            pass: 'botPassword'
        }
    },
    domain = 'http://localhost:3003',
    // create reusable transporter object using the default SMTP transport
    transporter = nodemailer.createTransport(smtpConfig),

    sendMail = function (to) {
        return new Promise(function (resolve, reject) {
            var mailOptions = {
                from: '"Auto.Ru Watchdog Bot" <bot@ccomf.ru>',
                to: to, // list of receivers
                subject: 'Обновления в списке автомобилей',
                html: '<b>Hello world!</b>' // html body
            };

            transporter.sendMail(mailOptions, function (error, info) {
                if (error) {
                    console.log(error);
                    return reject(error);
                }
                console.log('Message sent: ' + info.response);
                return resolve(info.response);
            });
        });
    },

    renderMessage = function (link, cars) {
        return hbs.render('email', {
            domain: domain,
            link: link,
            cars: cars
        });
    };

module.exports = {
    send: sendMail,
    render: renderMessage
};