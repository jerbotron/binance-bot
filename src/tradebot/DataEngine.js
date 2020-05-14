#!/usr/bin/env node

"use strict";

const http = require('https');
const querystring = require('querystring');
const Rx = require('rxjs/Rx');
const {
    TradeSnapshot
} = require('../dto/Trade.js');
const {
    formatDate,
} = require('../common/Utils.js');
const {
    Position
} = require('../common/Constants.js');

/*
	DataEngine processes ticker/trade data from web socket stream and evaluates trade decisions in realtime.
*/
class DataEngine {
    constructor(client, tradeConfig, eventLogger) {
        this.client = client;
        this.tradeConfig = tradeConfig;
        this.logger = eventLogger;
        this.decisionSubject = new Rx.Subject();
    }

    /*
        Start initializes the DataEngine using past data and begins tracking and evaluating minutely candle data while
        emitting trade signals.
    */
    start() {
        this.snapshot = null;
        this.pos = this.tradeConfig.position;

        let decisionHandler = (decision) => {
            if (decision.pos === Position.BUY || decision.pos === Position.SELL) {
                if (this.tradeConfig.isSimulation) {
                    decision.isSimulation = true;
                }
                this.emitTradeDecision(decision);
                this.setPosition(Position.PENDING);
            } else {
                this.logger.logError("received invalid decision event, " + decision.pos);
            }
        };

        this.backFillData(new Date(Date.now()))
            .then(res => {
                this.snapshot = res;
                this.logger.logInfo("backfill complete, opening client web socket...")
                this.close = this.client.ws.candles(this.tradeConfig.symbol, '1m', candle => {
                    let date = new Date(candle.eventTime);
                    let curMinute = date.getUTCMinutes() === 0 ? 60 : date.getUTCMinutes();
                    let lastMinute = this.snapshot.timestamp.getUTCMinutes();
                    if (curMinute - lastMinute >= 1) {
                        if (candle.isFinal) {
                            this.snapshot.appendAndEvaluateTradeDecision(this.pos, candle, decisionHandler);
                        } else {

                        }
                        this.logger.logCandle(candle);
                    }
                })
            })
            .catch(err => {
                this.logger.logError("unable to backfill historical trade data, shutting down DataEngine, " + err);
                this.stop();
            });
    }

    stop() {
        this.logger.logInfo("shutting down DataEngine");
        if (this.close) {
            this.close();
        }
    }

    async backFillData(curTime) {
        curTime.setUTCSeconds(0, 0);
        let startTime = new Date(curTime);
        startTime.setUTCMinutes(curTime.getUTCMinutes() - this.tradeConfig.wSize, 0, 0);

        this.logger.logInfo(`backfilling data from ${formatDate(startTime)} to ${formatDate(curTime)}`);

        const params = {
            'symbol': this.tradeConfig.symbol,
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

    onTradeDecision() {
        return this.decisionSubject;
    }

    emitTradeDecision(decision) {
        this.decisionSubject.next(decision);
    }

    subscribeOrderStatus() {
        return Rx.Subscriber.create(
            res => {
                if (res.side === Position.BUY) {
                    this.setPosition(Position.SELL);
                } else if (res.side === Position.SELL) {
                    this.setPosition(Position.BUY);
                } else {
                    this.logger.logError("unexpected msg in onOrderStatus(), " + res.side);
                }
            },
            e => {
                this.logger.logError("failed to complete an order, " + e);
            },
            () => {
                this.logger.logInfo("order status subscription stream closed");
            }
        );
    }
}

module.exports = DataEngine;