#!/usr/bin/env node

"use strict";

const Rx = require('rxjs/Rx');
const {
    TradeDecision
} = require("../dto/Trade");
const OrderBook = require("../dto/OrderBook");
const {
    Position,
    OrderType
} = require('../common/Constants');

/*
    AutoTrader subscribes to trade decision signals from DataEngine and executes trades and emits signals when the order
    is complete.
 */
class AutoTrader {
    constructor(client, symbol, dataEngine, eventLogger) {
        this.client = client;
        this.symbol = symbol;
        this.logger = eventLogger;
        this.msgBot = null;
        this.orderSubject = new Rx.Subject();

        // Configure subscription streams
        this.tradeSubscription = dataEngine.onTradeDecision()
            .subscribeOn(Rx.Scheduler.asap)
            .observeOn(Rx.Scheduler.queue)
            .subscribe(this.subscribeTradeDecision());

        this.orderSubscription = this.orderSubject
            .subscribeOn(Rx.Scheduler.asap)
            .observeOn(Rx.Scheduler.queue)
            .subscribe(dataEngine.subscribeOrderStatus());

        // Init account info
        this.getExchangeInfo().then(res => {
            this.orderBook = new OrderBook(client, symbol, res, eventLogger);
        });
    }

    stop() {
        this.logger.logInfo("shutting down AutoTrader");
        this.orderBook.stop();
        if (this.tradeSubscription) this.tradeSubscription.unsubscribe();
        if (this.orderSubscription) this.orderSubscription.unsubscribe();
    }

    subscribeTradeDecision() {
        return Rx.Subscriber.create(
            tradeDecision => {
                this.sendOrder(tradeDecision);
            },
            e => {
                this.logger.logError("onTradeDecision() error, " + e);
            },
            () => {
                this.logger.logInfo("auto trade subscription stream closed");
            },
        );
    }

    sendOrder(decision, type = OrderType.MARKET) {
        let order = {
            symbol: decision.symbol,
            side: decision.pos,
            type: type,
            quantity: this.orderBook.getTradeQty(decision.pos, decision.price)
            //price: decision.price (price not required from market orders
        };
        try {
            this.client.order(order).then(res => {
                if (res.status === "FILLED") {
                    this.orderSubject.next(res);
                    this.logger.logOrder(res);
                } else {
                    this.logger.logError("order was not fully filled, id = " + res.orderId);
                }
                this.orderBook.updateBalances().then();
            });
        } catch (e) {
            this.logger.logError("error occurred in sendOrder(), " + e);
            this.orderSubject.error(e);
        }
    }

    async getExchangeInfo() {
        try {
            return await this.client.exchangeInfo();
        } catch (e) {
            // this.msgBot.say("Errored in getExchangeInfo()");
            this.logger.logError("failed to get exchange info, " + e);
        }
    }
}

module.exports = AutoTrader;
