#!/usr/bin/env node

"use strict";

const Rx = require('rxjs/Rx');
const {
    GetHistoricalKlines
} = require('../http/Client');
const {
    TradeSnapshot
} = require('../dto/Trade');
const {
    formatDate,
} = require('../common/Utils');
const {
    Position
} = require('../common/Constants');

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
                    if (curMinute - lastMinute >= 1 && candle.isFinal) {
                        this.snapshot.updateAndEvaluateTradeDecision(this.pos, candle, decisionHandler);
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

        return GetHistoricalKlines(this.tradeConfig.symbol, startTime.getTime(), curTime.getTime())
            .then(body => {
                    return new Promise(resolve => {
                        resolve(new TradeSnapshot(this.tradeConfig, body));
                    });
                }
            );
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