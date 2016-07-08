"use strict";

var config = require("config").get('config.telegram'),
    TelegramBot = require('node-telegram-bot-api'),
    db = require('./db.js');
// Setup polling way
var bot = new TelegramBot(config.token, {polling: true});

db.startup().then(function (connection) {
//Start handler. Uses deep linking to authenticate the user.
    bot.onText(/\/start ?(.*)/, function (msg, match) {
        var fromId = msg.from.id,
            chatId = msg.chat.id,
            token = match[1];

        //check whether this token actually exists and belongs to some user
        return db.getUserByAuthKey(token)
            .then(function (user) {
                return db.addUserTelegramChat(user.id, chatId, fromId)
                    .then(function (res) {
                        if (res) {
                            console.log("Уведомления успешно активированы для аккаунта " + user.email);
                            return bot.sendMessage(fromId, "Уведомления успешно активированы для аккаунта " + user.email);
                        }
                    });
            })
            .catch(function (err) {
                var message = 'ОШИБКА: ';
                console.log(err.error);
                switch (err.error) {
                    case 'TELEGRAM_CHAT_ALREADY_STARTED':
                    {
                        message += 'Чат уже активирован. Удалите предыдущий чат, прежде чем начинать новый.';
                        break;
                    }
                    case 'NO_TELEGRAM_CHAT_ID':
                    case 'NO_AUTHKEY':
                    {
                        message += 'Токен активации чата не передан.';
                        break;
                    }
                    case 'MULTIPLE_ACCOUNTS_CHAT':
                    {
                        message += 'Вы уже получаете уведомления от другого аккаунта. Ведение нескольких аккаунтов одновременно запрещено!';
                        break;
                    }
                    case 'USER_NOT_FOUND':
                    {
                        message += 'Пользователь с переданным токеном не найден.';
                        break;
                    }
                    default:
                    {
                        message += `Ошибка создания чата (${err.error || 'Неизвестная'})`;
                        break;
                    }
                }
                return bot.sendMessage(fromId, message);
            });
    });


// Matches /latest [limit]
    bot.onText(/\/latest (\d+)/, function (msg, match) {
        var chatId = msg.chat.id,
            limit = match[1] || 5;

        activationCheck(chatId)
            .then((user)=> {
                db.getLatestAddedCarsForAllLinks(user.id, limit)
            })
            .then((cars)=> {
                return cars.forEach((item, index)=> {
                    bot.sendMessage(chatId, JSON.stringify(item));
                });
            });
    });

// Any kind of message
    bot.on('message', function (msg) {
        var chatId = msg.chat.id;
        console.log("Bot acquired message '%s' from %s", JSON.stringify(msg), chatId);
    });
});


function activationCheck(chatId) {
    return db.getUserByTelegramChatId(chatId)
}
