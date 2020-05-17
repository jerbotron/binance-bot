#!/usr/bin/env node

"use strict";

const Rx = require('rxjs/Rx');
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
        }).catch(e => {
            this.logger.logError(`failed to get exchange info, ${e}`);
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
            type: type
        };
        if (decision.pos === Position.BUY) {
            order.quoteOrderQty = this.orderBook.getTradeQty(decision.pos, decision.price);
        } else if (decision.pos === Position.SELL) {
            order.quantity = this.orderBook.getTradeQty(decision.pos, decision.price);
        }
        if (decision.isSimulation) {
            this.client.orderTest(order).then(() => {
                this.orderSubject.next({side: decision.pos});
                this.logger.logInfo(`Simulated a ${decision.pos} order at ${decision.price}`);
            });
            return;
        }
        this.client.order(order).then(res => {
            if (res.status === "FILLED") {
                this.orderSubject.next(res);
                this.logger.logOrder(res, decision.price);
            } else {
                this.logger.logError("order was not fully filled, id = " + res.orderId);
            }
            this.orderBook.updateBalances().then();
        }).catch(e => {
            this.logger.logError(`${order.type} ${order.side} at ${decision.price} failed, qty: ${order.quantity}, quoteQty: ${order.quoteOrderQty}`);
            this.orderSubject.error(e);
        });
    }

    async getExchangeInfo() {
        return await this.client.exchangeInfo();
    }
}

module.exports = AutoTrader;
