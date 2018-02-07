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

const ORDER_POLLING_TIMEOUT_MS = 40000;
const ORDER_POLLING_INTERVAL_MS = 500;

const BOLLINGER_BAND_FACTOR = 2;

const TRADE_QTY = 50;

const IS_SIMULATION = false;		// Switch to turn on/off simulation mode
const START_BUYING = false;

var cumulativeGain = 1;

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

		if (START_BUYING) {
			this.position = Position.BUY;
			this.subscribeBuy();
		} else {
			this.position = Position.SELL;
			this.subscribeSell();
		}
	}

	subscribeBuy() {
		if (this.position == Position.BUY) {
			console.log("Subscribed to BUY Alerts");
			this.buySubscription = this.dataEngine.alertBuyPrice()
												  .subscribeOn(Rx.Scheduler.asap)
												  .observeOn(Rx.Scheduler.queue)
												  .subscribe(this.autoBuy());
		}
	}

	unsubscribeBuy() {
		if (this.position != Position.BUY) {
			console.log("UN-subscribed to BUY Alerts");
			this.buySubscription.unsubscribe();
		}
	}

	subscribeSell() {		
		if (this.position == Position.SELL) {
			console.log("Subscribed to SELL Alerts");
			this.sellSubscription = this.dataEngine.alertAskPrice()
												   .subscribeOn(Rx.Scheduler.asap)
												   .observeOn(Rx.Scheduler.queue)
												   .subscribe(this.autoSell());
		}
	}

	unsubscribeSell() {
		if (this.position != Position.SELL) {
			console.log("UN-subscribed to SELL Alerts");
			this.sellSubscription.unsubscribe();
		}
	}

	autoBuy() {
		return Rx.Subscriber.create(
			x => {	
				if (this.prevBuyTicker == null) {
					this.prevBuyTicker = x.ticker;
					return;
				}

				let floor = x.ema - BOLLINGER_BAND_FACTOR * x.std;
				// console.log(`${this.position}\tticker=${x.ticker}\prevBuyTicker=${this.prevBuyTicker}\tema=${x.ema}\tfloor=${floor}`);
				// console.log(`${this.position == Position.BUY}\t${x.ticker>=this.prevBuyTicker}\t${x.ticker>=floor}\t${x.ticker<=x.ema}`);
				if (this.position == Position.BUY && 
					x.ticker >= this.prevBuyTicker && 
					x.ticker > floor &&  
					x.ticker < x.ema)
				{
					this.buy(x.ticker, TRADE_QTY, OrderType.LIMIT);
				}

				this.prevBuyTicker = x.ticker;
			},
			e => {
				console.log('onError: %s', e);
			},
			() => {
				console.log('onCompleted');
			}
		);
	}

	autoSell() {
		return Rx.Subscriber.create(
			x => {
				if (this.prevAskTicker == null) {
					this.prevAskTicker = x.ticker;
					return;
				}

				let ceil = x.ema + BOLLINGER_BAND_FACTOR * x.std;
				let percentGain = null;
				if (this.lastBoughtPrice) {
					percentGain = (x.ticker/this.lastBoughtPrice - 1)*100;
				}
				// console.log(`${this.position}\tticker=${x.ticker}\prevAskTicker=${this.prevAskTicker}\tema=${x.ema}\tceil=${ceil}`);
				// console.log(`${this.position == Position.SELL}\t${x.ticker<=this.prevAskTicker}\t${x.ticker <= ceil}`);
				if (this.position == Position.SELL && 
					x.ticker <= this.prevAskTicker &&
					(percentGain == null || percentGain >= 0.25) && 
					x.ticker > x.ema) 
				{
					this.sell(x.ticker, TRADE_QTY, OrderType.LIMIT);
				}
				this.prevAskTicker = x.ticker;
			},
			e => {
				console.log('onError: %s', e);
			},
			() => {
				console.log('onCompleted');
			}
		);
	}

	waitForOrder(currentPosition, orderId) {
		this.pollOrderStatus((status) => {
			switch (status) {
				case OrderStatus.FILLED: {
					this.position = (currentPosition == Position.BUY) ? Position.SELL : Position.BUY;
					return true;
				}
				case OrderStatus.CANCELED:
				case OrderStatus.REJECTED:
				case OrderStatus.EXPIRED:
				case OrderStatus.ERRORED: {
					this.position = currentPosition;
					return true;
				}
				default:
					return false;
			}
		}, orderId)
		.then((res) => {
			if (res.status == OrderStatus.FILLED) {
				let msg = "";
				if (res.side == Position.BUY) {					
					msg = `Bought ${res.executedQty} of ${res.symbol} @ ${res.price}`;
					this.lastBoughtPrice = Number(res.price);
					this.subscribeSell();
					this.unsubscribeBuy();
				} else if (res.side == Position.SELL) {
					msg = `Sold ${res.executedQty} of ${res.symbol} @ ${res.price}\n`;
					if (this.lastBoughtPrice) {
						let percentChange = ((Number(res.price)/this.lastBoughtPrice) - 1) * 100;
						cumulativeGain *= (1 + percentChange/100);
						if (percentChange > 0) {
							msg += `Made profit of ${percentChange}% | cumulative gain of ${cumulativeGain}`;
						} else {
							msg += `Suffered loss of ${percentChange} | cumulative gain of ${cumulativeGain}%`;
						}
					}
					this.lastSoldPrice = Number(res.price);
					this.subscribeBuy();
					this.unsubscribeSell();
				}
				console.log(msg);
				this.msgBot.say(msg);
				this.logger.write(`${res.transactTime}\t${res.price}\t${res.origQty}\t${res.executedQty}\t${res.clientOrderId}`);
			} else if (res.status == OrderStatus.CANCELED) {
				if (this.position == Position.BUY) {
					this.subscribeBuy();
				} else if (this.position == Position.SELL) {
					this.subscribeSell();
				}
			}
		})
		.catch((e) => {
			console.log(e);
			this.msgBot.say(e);
		});
	}

	async sell(price, qty, type = OrderType.MARKET) {
		console.log(`Excecuting SELL at ${price} of ${qty} shares`);
		this.msgBot.say(`Excecuting SELL at ${price} of ${qty} shares`);
		if (IS_SIMULATION) {
			this.position = Position.BUY;
			this.subscribeBuy();
			this.unsubscribeSell();
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
			// console.log(res);
			this.waitForOrder(Position.SELL, res.clientOrderId);
		} catch(e) {
			console.log(e);
			this.msgBot.say(e);
		}
	}

	async buy(price, qty, type = OrderType.MARKET) {
		console.log(`Excecuting BUY at ${price} of ${qty} shares`);
		this.msgBot.say(`Excecuting BUY at ${price} of ${qty} shares`);
		if (IS_SIMULATION) {
			this.position = Position.SELL;
			this.subscribeSell();
			this.unsubscribeBuy();
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
			// console.log(res);
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

	pollOrderStatus(isOrderFinished, orderId) {
		var endTime = Number(new Date()) + ORDER_POLLING_TIMEOUT_MS;
		var checkCondition = async (resolve, reject) => {
			try {
				var res = await this.client.getOrder({
					symbol: this.symbol,
					origClientOrderId: orderId
				});
				if (isOrderFinished(res.status)) {
					resolve(res);
				} else {
					if(Number(new Date()) >= endTime && res.status != OrderStatus.PARTIALLY_FILLED) {
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

