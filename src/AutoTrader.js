#!/usr/bin/env node

"use strict";

import Binance from 'binance-api-node'
import Rx from 'rxjs/Rx'
import DataEngine from './DataEngine.js'
import fs from 'fs';

const CONFIG = require("../config.json");

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

const ORDER_POLLING_TIMEOUT_MS = 35000;
const ORDER_POLLING_INTERVAL_MS = 500;

const BOLLINGER_BAND_FACTOR = 2;
const TRADE_QTY = 100;
const FEE_PERCENT = 0.05; // Assuming user has BNB in account
const CANCELED_PARTIAL_FILLED_LIMIT = 0.5;

const IS_SIMULATION = false;			// Switch to turn on/off simulation mode
const START_BUYING = false;
const CANCEL_ON_PARTIAL_FILL = true;

export default class AutoTrader {

	constructor(symbol, dataEngine, msgBot) {
		this.symbol = symbol;
		this.dataEngine = dataEngine;
		this.msgBot = msgBot;
		this.client = Binance({
			apiKey: CONFIG.API_KEY,
			apiSecret: CONFIG.API_SECRET
		});
		this.logger = fs.createWriteStream(`logs/${this.symbol}_trades.txt`);

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
					// console.log(`${this.position}\tticker=${x.ticker}\prevBuyTicker=${this.prevBuyTicker}\tema=${x.ema}\tfloor=${floor}`);
					// console.log(`${this.position == Position.BUY}\t${x.ticker>=this.prevBuyTicker}\t${x.ticker>=floor}\t${x.ticker<=x.ema}`);
					if (this.position == Position.BUY && 
						x.ticker >= this.prevBuyTicker && 
						x.ticker > floor &&  
						x.ticker < x.ema)
					{
						this.buy(x.ticker, this.tradeQty, OrderType.LIMIT);
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
					let percentGain = (this.lastBoughtPrice) ? getPercentGain(x.ticker, this.lastBoughtPrice, FEE_PERCENT) :  null;
					// console.log(`${this.position}\tticker=${x.ticker}\prevAskTicker=${this.prevAskTicker}\tema=${x.ema}\tceil=${ceil}`);
					// console.log(`${this.position == Position.SELL}\t${x.ticker<=this.prevAskTicker}\t${x.ticker <= ceil}`);
					if (this.position == Position.SELL && 
						x.ticker <= this.prevAskTicker &&
						(percentGain == null || percentGain >= 0.20) && 
						x.ticker > x.ema) 
					{
						this.sell(x.ticker, this.tradeQty, OrderType.LIMIT);
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
		// this.msgBot.say(`Excecuting SELL at ${price} of ${qty} shares`);
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
			this.msgBot.say(e);
		}
	}

	async buy(price, qty, type = OrderType.MARKET) {
		console.log(`Excecuting BUY at ${price} of ${qty} shares`);
		// this.msgBot.say(`Excecuting BUY at ${price} of ${qty} shares`);
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
			this.msgBot.say(e);
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
			this.msgBot.say(e);
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
		}, orderId)
		.then((res) => {
			if (res.status == OrderStatus.FILLED || (res.status == OrderStatus.CANCELED && this.isPartiallyFilled)) {
				let msg = "";
				if (res.side == Position.BUY) {					
					msg = `Bought ${res.executedQty} of ${res.symbol} @ ${res.price}`;
					this.lastBoughtPrice = Number(res.price);
				} else if (res.side == Position.SELL) {
					msg = `Sold ${res.executedQty} of ${res.symbol} @ ${res.price}\n`;
					if (this.lastBoughtPrice) {
						let percentChange = getPercentGain(res.price, this.lastBoughtPrice, FEE_PERCENT);
						this.cumulativeGain *= (1 + percentChange/100);
						if (percentChange > 0) {
							msg += `Made profit of ${percentChange}% | cumulative gain of ${(this.cumulativeGain-1)*100}%`;
						} else {
							msg += `Suffered loss of ${percentChange} | cumulative gain of ${(this.cumulativeGain-1)*100}%`;
						}
					}
					this.lastSoldPrice = Number(res.price);
				}
				console.log(msg);
				this.msgBot.say(msg);

				// Log trade data
				let action = (res.side == Position.BUY) ? "BOUGHT" : "SOLD";
				this.logger.write(`${action}\t${res.time}\t${res.clientOrderId}\t${res.price}\t${res.origQty}\t${res.executedQty}\n`);

				if (res.status == OrderStatus.FILLED || 
					(this.isPartiallyFilled && Number(res.executedQty)/Number(res.origQty) > CANCELED_PARTIAL_FILLED_LIMIT)) {
					this.position = (currentPosition == Position.BUY) ? Position.SELL : Position.BUY; 
				} else {
					this.position = currentPosition;
				}
				this.tradeQty = res.executedQty;
			} else if (res.status == OrderStatus.CANCELED) {
				console.log("Back to " + this.position);
				this.position = currentPosition;
			}
		})
		.catch((e) => {
			console.log(e);
			this.msgBot.say(e);
		});
	}

	pollOrderStatus(isOrderFinished, orderId) {
		var endTime = Number(new Date()) + ORDER_POLLING_TIMEOUT_MS;
		var checkCondition = async (resolve, reject) => {
			try {
				var res = await this.client.getOrder({
					symbol: this.symbol,
					origClientOrderId: orderId
				});
				if (isOrderFinished(res)) {
					resolve(res);
				} else {
					if (Number(new Date()) >= endTime) {
						if (res.status != OrderStatus.PARTIALLY_FILLED || CANCEL_ON_PARTIAL_FILL) {
							this.cancel(orderId);
						}
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
