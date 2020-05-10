#!/usr/bin/env node

"use strict";

const http = require('https');
const querystring = require('querystring');
const Rx = require('rxjs/Rx');
const {
    TradeSnapshot
} = require('../dto/Trade.js');
const {
    msToS,
    getDate,
    formatDate,
} = require('../common/Utils.js');
const {
    Position
} = require('../common/Constants.js');

/*
	DataEngine processes ticker/trade data from web socket stream and evaluates trade decisions in realtime.
*/
class DataEngine {
    constructor(client, tradeConfig) {
        this.client = client;
        this.tradeConfig = tradeConfig;
        this.logger = require('fs').createWriteStream(`./logs/${getDate()}_${tradeConfig.Symbol}.txt`);
        this.logger.write("timestamp,trade,price");

        this.decisionSubject = new Rx.Subject();
    }

    /*
        Start initializes the DataEngine using past data and begins tracking and evaluating minutely candle data while
        emitting trade signals.
    */
    start() {
        this.snapshot = null;
        this.pos = this.tradeConfig.position;

        this.backFillData(new Date(Date.now()))
            .then(res => {
                console.log(res);
                this.snapshot = res;
                this.close = this.client.ws.candles(this.tradeConfig.Symbol, '1m', candle => {
                    let date = new Date(candle.eventTime);
                    let curMinute = date.getUTCMinutes() === 0 ? 60 : date.getUTCMinutes();
                    let lastMinute = this.snapshot.timestamp.getUTCMinutes();
                    if (curMinute - lastMinute >= 1) {
                        if (curMinute - lastMinute > 1) {
                            console.log(`Warning: lost ${curMinute - lastMinute} minute(s) of data at ${date.toISOString()}`);
                        }
                        if (this.pos === Position.PENDING) {
                            return;
                        }
                        this.snapshot.appendAndEvaluateTradeDecision(this.pos, candle, price => {
                            this.emitTradeDecision(date.toISOString(), this.pos, price);
                            this.setPosition(Position.PENDING);
                        });
                    }
                })
            })
            .catch(err => {
                console.log(err);
                console.log("Unable to backfill historical trade data, shutting down DataEngine...");
                this.stop();
            });
    }

    stop() {
        if (this.close) {
            this.close();
        }
    }

    async backFillData(curTime) {
        curTime.setUTCSeconds(0, 0);
        let startTime = new Date(curTime);
        startTime.setUTCMinutes(curTime.getUTCMinutes() - this.tradeConfig.WSize, 0, 0);

        console.log(`Backfilling data from ${formatDate(startTime)} to ${formatDate(curTime)}`);

        const params = {
            'symbol': this.tradeConfig.Symbol,
            'interval': '1m',
            'startTime': startTime.getTime(),
            'endTime': curTime.getTime(),
        };
        const path = '/api/v3/klines?' + querystring.stringify(params);
        const options = {
            hostname: 'api.binance.com',
            path: path,
            method: 'GET'
        };
        let requestHistoricalKlines = (resolve, reject) => {
            let req = http.request(options, res => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error('statusCode=' + res.statusCode));
                }
                let body = [];
                res.on('data', chunk => {
                    body.push(chunk);
                });
                res.on('end', () => {
                    try {
                        body = JSON.parse(Buffer.concat(body).toString());
                    } catch (e) {
                        reject(e);
                    }
                    resolve(new TradeSnapshot(this.tradeConfig, body));
                });
            });
            req.on('error', err => {
                reject(err);
            });
            req.end();
        };
        return new Promise(requestHistoricalKlines);
    }

    setPosition(pos) {
        this.pos = pos;
    }

    emitTradeDecision(timestamp, pos, price) {
        console.log(`Executing ${pos} at ${price}`);
        this.logger.write(`${timestamp},${pos},${price}`);
        this.decisionSubject.next({pos: pos, price: price});
    }

    subscribeTradeDecision() {
        return this.decisionSubject;
    }
}

module.exports = DataEngine;