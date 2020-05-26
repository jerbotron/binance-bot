#!/usr/bin/env node

"use strict";

const fs = require('fs');
const AlertBot = require('../alertbot/AlertBot');

const Event = Object.freeze({
    Start: "START",
    Stop: "STOP",
    Candle: "CANDLE",
    Order: "ORDER",
    Info: "INFO",
    Error: "ERROR"
});

class EventLogger {
    constructor(symbol) {
        this.msgBot = new AlertBot();
        let curTime = new Date().toISOString().split('Z')[0];
        this.logger = fs.createWriteStream(`../logs/${symbol}_${curTime}.csv`, {
            flags: "w"
        });
    }

    logStart(base, quote) {
        console.log(`${Event.Start}\tSystem starting! Initial balances:`);
        console.log(`\t* Base: \t${base.symbol} \tfree: ${base.free}\t locked: ${base.locked}`);
        console.log(`\t* Quote:\t${quote.symbol}\tfree: ${quote.free}\t locked: ${quote.locked}`);
        this.logger.write([Event.Start, base.symbol, base.free, base.locked, quote.symbol, quote.free, quote.locked].join(',') + "\n");
    }

    // https://github.com/binance-exchange/binance-api-node#candles-1
    logCandle(candle) {
        let msg = [Event.Candle, new Date(candle.eventTime).toISOString(), candle.open, candle.close, candle.volume, candle.trades];
        console.log(msg.join('\t'));
        this.logger.write(msg.join(',') + "\n");
    }

    // https://github.com/binance-exchange/binance-api-node#order
    logOrder(order, price) {
        let msg = [Event.Order, new Date(order.transactTime).toISOString(), order.orderId, order.side, price, order.executedQty, order.cummulativeQuoteQty];
        console.log(msg.join('\t'));
        this.logger.write(msg.join(',') + "\n");
        this.msgBot.say(msg.join(','));
    }

    logInfo(msg) {
        console.log(`${Event.Info}\t${msg}`);
        this.msgBot.say(`${Event.Info}\t${msg}`);
    }

    logError(err) {
        let msg = [Event.Error, err];
        console.log(msg.join('\t'));
        this.logger.write(msg.join(',') + "\n");
        this.msgBot.say(msg.join(','));
    }

    logStop(base, quote) {
        console.log(`${Event.Info}\tclosing event logger`);
        console.log(`${Event.Stop}\tSystem shutting down! Final balances:`);
        console.log(`\t* ${base.symbol}\tfree: ${base.free}\t locked: ${base.locked}`);
        console.log(`\t* ${quote.symbol}\tfree: ${quote.free}\t locked: ${quote.locked}`);
        if (base.free > quote.free) {
            console.log(`\t* Net gain in ${base.symbol}: ${(base.free / base.origQty - 1) * 100}%`);
        } else {
            console.log(`\t* Net gain in ${quote.symbol}: ${(quote.free / quote.origQty - 1) * 100}%`);
        }
        this.logger.write([Event.Stop, base.symbol, base.free, base.locked, quote.symbol, quote.free, quote.locked].join(',') + "\n");
    }

    stop() {
        this.logger.end();
    }
}

module.exports = EventLogger;