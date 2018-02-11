#!/usr/bin/env node

"use strict";

import Rx from 'rxjs/Rx'
import DataEngine from './DataEngine.js'
import fs from 'fs';
import { getDate } from './Utils.js';
import { 
	Position,
	OrderStatus,
	OrderType,
	FilterType
} from './Constants.js'
import { TradeParams } from '../app.js'

const ORDER_POLLING_TIMEOUT_MS = 30000;
const ORDER_POLLING_INTERVAL_MS = 500;

const BOLLINGER_BAND_FACTOR = 2;
const FEE_PERCENT = 0.015/100; 			// Assuming user has BNB in account

export default class AutoTrader {

	constructor(client, dataEngine, tracker, msgBot) {
		this.symbol = TradeParams.SYMBOL;
		this.dataEngine = dataEngine;
		this.tracker = tracker;
		this.msgBot = msgBot;
		this.client = client;
		this.logger = fs.createWriteStream(`logs/${getDate()}/${this.symbol}_trades.txt`);

		this.prevAskTicker = null;
		this.prevBuyTicker = null;
		this.lastBoughtPrice = null;
		this.lastSoldPrice = null;

		this.cumulativeGain = 1;
		this.tradeQty = TradeParams.TRADE_QTY;
		this.isPartiallyFilled = false;

		this._MIN_TICK = null;
		this._MIN_NOTIONAL = null;
		this._PRECISION = null;

		this.initTradeInfo();
	}

	initTradeInfo() {
		this.getExchangeInfo().then(res => {
			for (let i = 0; i < res.symbols.length; i++) {
				if (res.symbols[i].symbol == this.symbol) {
					this._PRECISION = Number(res.symbols[i].baseAssetPrecision);
					res.symbols[i].filters.forEach(filter => {
						if (filter.filterType == FilterType.PRICE_FILTER) {
							this._MIN_TICK = Number(filter.tickSize);
						} 
						else if (filter.filterType == FilterType.MIN_NOTIONAL) {
							this._MIN_NOTIONAL = Number(filter.minNotional);
						}
					});
					break;
				}
			}
			this.position = TradeParams.INITIAL_POSITION;
		});
	}

	start() {
		this.subscribeBuy();
		this.subscribeSell();
		this.tracker.trackTicker(this.symbol);
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
					let floor = x.ma - BOLLINGER_BAND_FACTOR * x.std;
					let price = (x.ticker + this._MIN_TICK).toFixed(this._PRECISION);
					console.log(`${this.position}\t${x.ticker}\t${price}\t${floor}\t${x.ma}`);
					if (this.position == Position.BUY && 
						x.ticker >= this.prevBuyTicker && 
						x.ticker > floor &&  
						price < x.ma)
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
					let ceil = x.ma + BOLLINGER_BAND_FACTOR * x.std;
					let price = (x.ticker - this._MIN_TICK).toFixed(this._PRECISION);
					let percentGain = (this.lastBoughtPrice) ? getPercentGain(price, this.lastBoughtPrice, FEE_PERCENT) :  null;
					console.log(`${this.position}\t${x.ticker}\t${price}\t${this.lastBoughtPrice}\t${percentGain}\t${x.ma}`);
					if (this.position == Position.SELL && 
						price <= this.prevAskTicker &&
						(percentGain == null || percentGain >= TradeParams.MIN_PERCENT_GAIN) && 
						price > x.ma) 
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
		console.log(`Executing SELL of ${this.symbol} at ${price} of ${qty} shares`);
		this.msgBot.say(`Executing SELL of ${this.symbol} at ${price} of ${qty} shares`);
		if (TradeParams.IS_SIMULATION) {
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
		console.log(`Executing BUY of ${this.symbol} at ${price} of ${qty} shares`);
		this.msgBot.say(`Executing BUY of ${this.symbol} at ${price} of ${qty} shares`);
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

	async getExchangeInfo() {
		try {
			return await this.client.exchangeInfo();
		} catch(e) {
			console.log(e);
			this.msgBot.say("Errored in getExchangeInfo()");
		}
	}

	async orderTest(price, qty, type = OrderType.LIMIT) {
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
			return await this.client.orderTest(order);
		} catch(e) {
			console.log(e);
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

				// reset trade variables
				let notional = Number(res.executedQty) * Number(res.price);
				this.position = (currentPosition == Position.BUY) ? Position.SELL : Position.BUY; 
				this.tradeQty = (res.status == OrderStatus.FILLED || 
								 this.position == TradeParams.INITIAL_POSITION ||
								 notional < this._MIN_NOTIONAL) ? TradeParams.TRADE_QTY : res.executedQty;
				this.isPartiallyFilled = false;	// reset this flag after we finish an order
			} else if (res.status == OrderStatus.CANCELED) {
				// console.log("Back to " + currentPosition);
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
				this.getOrder(orderId).then((order) => {
					if (isOrderFinished(order)) {
						resolve(order);
					} else {
						this.getBook().then((book) => {
							// cancel if order is out of top 2 bids/asks
							if ((currentPosition == Position.BUY && Number(order.price) < Number(book.bids[1].price)) ||
								(currentPosition == Position.SELL && Number(order.price) > Number(book.asks[1].price))) 
							{
								this.cancel(orderId);
							}
							setTimeout(checkCondition, ORDER_POLLING_INTERVAL_MS, resolve, reject);
						});
					}
				});
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
function increaseLowestDigit(n, symbol) {
	let d = 1;
	for (let i = n.length-1; i >= 0; i--) {
		if (n.charAt(i) == '.') {
			d = n.length - 1 - i;
			break;
		}
	}
	return (Number(n) + 1/Math.pow(10, d)).toFixed(8);
}

// n must be a string
function decreaseLowestDigit(n, symbol) {
	let d = 1;
	for (let i = n.length-1; i >= 0; i--) {
		if (n.charAt(i) == '.') {
			d = n.length - 1 - i
			break;
		}
	}
	return (Number(n) - 1/Math.pow(10, d)).toFixed(8);
}
