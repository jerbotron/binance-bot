#!/usr/bin/env node

"use strict";

import Rx from 'rxjs/Rx'
import DataEngine from './DataEngine.js'
import fs from 'fs';
import { getDate } from './Utils.js';

const Position = Object.freeze({
	BUY: 'BUY',
	SELL: 'SELL',
	PENDING: 'PENDING'
});

const OrderStatus = Object.freeze({
	NEW: 'NEW',
	PARTIALLY_FILLED: 'PARTIALLY_FILLED',
	FILLED: 'FILLED',
	CANCELED: 'CANCELED',
	REJECTED: 'REJECTED',
	EXPIRED: 'EXPIRED',
	ERRORED: 'ERRORED'
});

const OrderType = Object.freeze({
	LIMIT: 'LIMIT',
	MARKET: 'MARKET'
});

const ORDER_POLLING_TIMEOUT_MS = 30000;
const ORDER_POLLING_INTERVAL_MS = 500;

const BOLLINGER_BAND_FACTOR = 2;
const TRADE_QTY = 100;
const FEE_PERCENT = 0.05/100; // Assuming user has BNB in account
const CANCELED_PARTIAL_FILLED_LIMIT = 0.5;

const IS_SIMULATION = true;			// Switch to turn on/off simulation mode
const START_BUYING = false;
const CANCEL_ON_PARTIAL_FILL = true;

export default class AutoTrader {

	constructor(client, symbol, dataEngine, msgBot) {
		this.symbol = symbol;
		this.dataEngine = dataEngine;
		this.msgBot = msgBot;
		this.client = client;
		this.logger = fs.createWriteStream(`data/${getDate()}/${this.symbol}_trades.txt`);

		this.prevAskTicker = null;
		this.prevBuyTicker = null;
		this.lastBoughtPrice = null;
		this.lastSoldPrice = null;

		this.cumulativeGain = 1;
		this.tradeQty = TRADE_QTY;
		this.isPartiallyFilled = false;

		if (START_BUYING) {
			this.position = Position.BUY;
		} else {
			this.position = Position.SELL;
		}
	}

	start() {
		this.subscribeBuy();
		this.subscribeSell();
	}

	stop() {
		this.unsubscribeBuy();
		this.unsubscribeSell();
	}

	subscribeBuy() {
		this.buySubscription = this.dataEngine.alertBuyPrice()
											  .subscribeOn(Rx.Scheduler.asap)
											  .observeOn(Rx.Scheduler.queue)
											  .subscribe(this.autoBuy());
	}

	subscribeSell() {		
		this.sellSubscription = this.dataEngine.alertAskPrice()
											   .subscribeOn(Rx.Scheduler.asap)
											   .observeOn(Rx.Scheduler.queue)
											   .subscribe(this.autoSell());
	}

	unsubscribeBuy() {
		this.buySubscription.unsubscribe();
	}

	unsubscribeSell() {
		this.sellSubscription.unsubscribe();
	}

	autoBuy() {
		return Rx.Subscriber.create(
			x => {
				if (this.position != Position.BUY) {
					return;
				}

				if (this.prevBuyTicker != null) {
					let floor = x.ema - BOLLINGER_BAND_FACTOR * x.std;
					let price = increaseLowestDigit(x.ticker.toString());
					console.log(`${this.position}\t${price}\t${x.ticker}`);
					if (this.position == Position.BUY && 
						price >= this.prevBuyTicker && 
						price > floor &&  
						price < x.ema)
					{
						this.buy(price, this.tradeQty, OrderType.LIMIT);
					}
				}
				this.prevBuyTicker = x.ticker;
			},
			e => {
				console.log(`onError: ${e}`);
				this.msgBot.say(`onError: ${e}`);
			},
			() => {
				console.log('onCompleted');
			}
		);
	}

	autoSell() {
		return Rx.Subscriber.create(
			x => {
				if (this.position != Position.SELL) {
					return;
				}

				if (this.prevAskTicker != null) {
					let ceil = x.ema + BOLLINGER_BAND_FACTOR * x.std;
					let price = decreaseLowestDigit(x.ticker.toString());
					let percentGain = (this.lastBoughtPrice) ? getPercentGain(price, this.lastBoughtPrice, FEE_PERCENT) :  null;
					console.log(`${this.position}\t${x.ticker}\t${price}\t${this.lastBoughtPrice}\t${percentGain}`);
					if (this.position == Position.SELL && 
						price <= this.prevAskTicker &&
						(percentGain == null || percentGain >= 0.20) && 
						price > x.ema) 
					{
						this.sell(price, this.tradeQty, OrderType.LIMIT);
					}
				}
				this.prevAskTicker = x.ticker;
			},
			e => {
				console.log(`onError: ${e}`);
				this.msgBot.say(`onError: ${e}`);
			},
			() => {
				console.log('onCompleted');
			}
		);
	}

	async sell(price, qty, type = OrderType.MARKET) {
		console.log(`Excecuting SELL at ${price} of ${qty} shares`);
		this.msgBot.say(`Excecuting SELL at ${price} of ${qty} shares`);
		if (IS_SIMULATION) {
			this.position = Position.BUY;
			return;
		}
		this.position = Position.PENDING;
		try {
			let order = {
				symbol: this.symbol,
				side: 'SELL',
				type: type,
				quantity: qty
			}
			if (type == OrderType.LIMIT) {
				order.price = price;
			}
			let res = await this.client.order(order);
			this.logger.write(`SELL\t${res.transactTime}\t${res.clientOrderId}\t${res.price}\t${res.origQty}\t${res.executedQty}\n`);
			this.waitForOrder(Position.SELL, res.clientOrderId);
		} catch(e) {
			console.log(e);
			this.msgBot.say("Errored in sell()");
		}
	}

	async buy(price, qty, type = OrderType.MARKET) {
		console.log(`Excecuting BUY at ${price} of ${qty} shares`);
		this.msgBot.say(`Excecuting BUY at ${price} of ${qty} shares`);
		if (IS_SIMULATION) {
			this.position = Position.SELL;
			return;
		}
		this.position = Position.PENDING;
		try {
			let order = {
				symbol: this.symbol,
				side: 'BUY',
				type: type,
				quantity: qty
			}
			if (type == OrderType.LIMIT) {
				order.price = price;
			}
			let res = await this.client.order(order);
			this.logger.write(`BUY\t${res.transactTime}\t${res.clientOrderId}\t${res.price}\t${res.origQty}\t${res.executedQty}\n`);
			this.waitForOrder(Position.BUY, res.clientOrderId);
		} catch(e) {
			console.log(e);
			this.msgBot.say("Errored in buy()");
		}
	}

	async cancel(orderId) {
		try {
			console.log(`Cancelling order: ${orderId}`);
			await this.client.cancelOrder({
				symbol: this.symbol,
				origClientOrderId: orderId
			});
		} catch(e) {
			console.log(e);
			this.msgBot.say("Errored in cancel()");
		}
	}

	async getOrder(orderId) {
		try {
			return await this.client.getOrder({
				symbol: this.symbol,
				origClientOrderId: orderId
			});
		} catch(e) {
			console.log(e);
			this.msgBot.say("Errored in getOrder()");
		}
	}

	async getBook() {
		try {
			return await this.client.book({symbol: this.symbol});
		} catch(e) {
			console.log(e);
			this.msgBot.say("Errored in getBook()");	
		}
	}

	waitForOrder(currentPosition, orderId) {
		this.pollOrderStatus((res) => {
			switch (res.status) {
				case OrderStatus.FILLED:
					this.isPartiallyFilled = false;
				case OrderStatus.CANCELED:
				case OrderStatus.REJECTED:
				case OrderStatus.EXPIRED:
				case OrderStatus.ERRORED: {
					return true;
				}
				case OrderStatus.PARTIALLY_FILLED:
					this.isPartiallyFilled = true;
				default:
					return false;
			}
		}, currentPosition, orderId)
		.then((res) => {
			if (res.status == OrderStatus.FILLED || (res.status == OrderStatus.CANCELED && this.isPartiallyFilled)) {
				let msg = "";
				if (res.side == Position.BUY) {					
					msg = `Bought ${res.executedQty} of ${res.symbol} @ ${res.price}`;
					this.lastBoughtPrice = Number(res.price);
				} else if (res.side == Position.SELL) {
					msg = `Sold ${res.executedQty} of ${res.symbol} @ ${res.price}`;
					if (this.lastBoughtPrice) {
						let percentChange = getPercentGain(res.price, this.lastBoughtPrice, FEE_PERCENT);
						this.cumulativeGain *= (1 + percentChange/100);
						if (percentChange > 0) {
							msg += `\nMade profit of ${percentChange}% | cumulative gain of ${(this.cumulativeGain-1)*100}%`;
						} else {
							msg += `\nSuffered loss of ${percentChange} | cumulative gain of ${(this.cumulativeGain-1)*100}%`;
						}
					}
					this.lastSoldPrice = Number(res.price);
				}
				console.log(msg);
				this.msgBot.say(msg);

				// Log trade data
				let action = (res.side == Position.BUY) ? "BOUGHT" : "SOLD";
				this.logger.write(`${action}\t${res.time}\t${res.clientOrderId}\t${res.price}\t${res.origQty}\t${res.executedQty}\n`);

				this.position = (currentPosition == Position.BUY) ? Position.SELL : Position.BUY; 
				this.tradeQty = (res.status == OrderStatus.FILLED) ? TRADE_QTY : res.executedQty;
				this.isPartiallyFilled = false;	// reset this flag after we finish an order
			} else if (res.status == OrderStatus.CANCELED) {
				console.log("Back to " + currentPosition);
				this.position = currentPosition;
			}
		})
		.catch((e) => {
			console.log(e);
			this.msgBot.say("Polling errored out, restartiing polling");
			this.waitForOrder(currentPosition, orderId);
		});
	}

	pollOrderStatus(isOrderFinished, currentPosition, orderId) {
		let checkCondition = (resolve, reject) => {
			try {
				let order = this.getOrder(orderId);
				if (isOrderFinished(res)) {
					resolve(res);
				} else {
					let book = this.getBook();
					let shouldCancel = false;
					// cancel if order is out of top 2 bids/asks
					if ((currentPosition == Position.BUY && Number(order.price) < Number(book.bids[1].price)) ||
						(currentPosition == Position.SELL && Number(order.price) > Number(book.asks[1].price))) 
					{
						this.cancel(orderId);
					}
					setTimeout(checkCondition, ORDER_POLLING_INTERVAL_MS, resolve, reject);
				}
			} catch(e) {
				reject(new Error("Polling errored out: " + e));
			}
		};
		return new Promise(checkCondition);
	}
}

function getPercentGain(sell, buy, feePercent) {
	return ((1-feePercent) * sell - (1+feePercent) * buy)/buy*100;
}

// n must be a string
function increaseLowestDigit(n) {
	let d = 1;
	for (let i = n.length-1; i >= 0; i--) {
		if (n.charAt(i) == '.') {
			d = n.length - 1 - i;
			console.log(i);
			break;
		}
	}
	return (Number(n) + 1/Math.pow(10, d)).toFixed(8);
}

// n must be a string
function decreaseLowestDigit(n) {
	let d = 1;
	for (let i = n.length-1; i >= 0; i--) {
		if (n.charAt(i) == '.') {
			d = n.length - 1 - i
			break;
		}
	}
	return (Number(n) - 1/Math.pow(10, d)).toFixed(8);
}
