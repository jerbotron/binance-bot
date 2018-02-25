#!/usr/bin/env node

"use strict";

import fs from 'fs';
import { 
	getDate
} from './Utils.js';
import { 
	getPercentGain
} from './Utils.js';
import { 
	Position,
	OrderStatus,
	OrderType,
	FilterType
} from './Constants.js'
import Balance from './data/Balance.js'
import { TradeParams } from '../app.js'

const ORDER_POLLING_INTERVAL_MS = 500;

const BOLLINGER_BAND_FACTOR = 2;
const FEE_PERCENT = 0.05/100; 			// Assuming user has BNB in account

export default class OrderManager {

	constructor(autoTrader, client, symbol, msgBot) {
		this.autoTrader = autoTrader;
		this.client = client;
		this.symbol = symbol;
		this.msgBot = msgBot;
		this.logger = fs.createWriteStream(`logs/${getDate()}/${this.symbol}_trades.txt`);

		this.askPrice = null;
		this.bidPrice = null;
		this.lastBoughtPrice = null;
		this.lastSoldPrice = null;

		this.cumulativeGain = 1;
		this.tradeQty = TradeParams.TRADE_QTY;
		this.isPartiallyFilled = false;

		this._MIN_TICK = null;
		this._MIN_QTY = null;
		this._MIN_NOTIONAL = null;
		this._PRECISION = null;
		this._BASE = null;		// first asset in symbol
		this._QUOTE = null;		// second asset in symbol
	}

	init(symbols) {
		for (let i = 0; i < symbols.length; i++) {
			if (symbols[i].symbol == this.symbol) {
				this._BASE = symbols[i].baseAsset;
				this._QUOTE = symbols[i].quoteAsset;
				this._PRECISION = Number(symbols[i].baseAssetPrecision);
				symbols[i].filters.forEach(filter => {
					if (filter.filterType == FilterType.PRICE_FILTER) {
						this._MIN_TICK = Number(filter.tickSize).toPrecision(this._PRECISION);
					}
					else if (filter.filterType == FilterType.LOT_SIZE) {
						this._MIN_QTY = Number(filter.minQty).toPrecision(this._PRECISION);
					} 
					else if (filter.filterType == FilterType.MIN_NOTIONAL) {
						this._MIN_NOTIONAL = Number(filter.minNotional).toPrecision(this._PRECISION);
					}
				});
				break;
			}
		}
		// console.log("PRECISION = " + this._PRECISION);
		// console.log("MIN_TICK = " + this._MIN_TICK);
		// console.log("MIN_QTY = " + this._MIN_QTY);
		// console.log("MIN_NOTIONAL = " + this._MIN_NOTIONAL);
	}

	setBalances(balances) {
		balances.forEach(balance => {
			if (balance.asset == this._BASE) {
				this.baseBalance = new Balance(balance.asset, balance.free);
			} else if (balance.asset == this._QUOTE) {
				this.quoteBalance = new Balance(balance.asset, balance.free);
			}
		});
	}

	updateTickers(ticker) {
		this.askPrice = ticker.ask;
		this.bidPrice = ticker.bid;
	}

	getPercentGain(price) {
		return (this.lastBoughtPrice) ? getPercentGain(price, this.lastBoughtPrice, FEE_PERCENT) :  null;
	}

	executeBuy(price) {
		let maxQty = (this.quoteBalance.qty / price).toPrecision(this._PRECISION);
		this.tradeQty = (this.tradeQty > maxQty) ? maxQty : this.tradeQty;
		if (this.isBelowMinimumNotional(this.tradeQty, price)) {
			this.autoTrader.setPosition(Position.SELL);
			this.tradeQty = TradeParams.TRADE_QTY;
		} else {
			this.buy(price, this.tradeQty.toPrecision(this._PRECISION), OrderType.LIMIT);
		}
	}

	executeSell(price) {
		this.tradeQty = (this.tradeQty > this.baseBalance.qty) ? this.baseBalance.qty : this.tradeQty;
		if (this.isBelowMinimumNotional(this.tradeQty, price)) {
			this.autoTrader.setPosition(Position.BUY);
			this.tradeQty = TradeParams.TRADE_QTY;
		} else {
			this.sell(price, this.tradeQty.toPrecision(this._PRECISION), OrderType.LIMIT);
		}
	}

	async sell(price, qty, type = OrderType.MARKET) {
		console.log(`Executing SELL of ${this.symbol} at ${price} of ${qty} shares`);
		this.msgBot.say(`Executing SELL of ${this.symbol} at ${price} of ${qty} shares`);
		if (TradeParams.IS_SIMULATION) {
			this.lastSoldPrice = price;
			this.autoTrader.setPosition(Position.BUY);
			return;
		}
		this.autoTrader.setPosition(Position.PENDING);
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
		if (TradeParams.IS_SIMULATION) {
			this.lastBoughtPrice = price;
			this.autoTrader.setPosition(Position.SELL);
			return;
		}
		this.autoTrader.setPosition(Position.PENDING);
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
					this.baseBalance.addQty(res.executedQty);
					this.quoteBalance.subtractQty(Number(res.executedQty) * Number(res.price));
				} else if (res.side == Position.SELL) {
					msg = `Sold ${res.executedQty} of ${res.symbol} @ ${res.price}`;
					this.baseBalance.subtractQty(res.executedQty);
					this.quoteBalance.addQty(Number(res.executedQty) * Number(res.price));
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

				// update trade variables
				let notional = Number(res.executedQty) * Number(res.price);

				if (res.status == OrderStatus.FILLED) {
					this.tradeQty = TradeParams.TRADE_QTY;
					this.autoTrader.togglePosition(currentPosition);
				} else {
					this.tradeQty -= Number(res.executedQty);
					if (this.tradeQty < this._MIN_QTY) {
						this.autoTrader.togglePosition(currentPosition);
						this.tradeQty = TradeParams.TRADE_QTY - this.tradeQty;
					} else {
						this.autoTrader.setPosition(currentPosition);
					}
				}
				this.isPartiallyFilled = false;	// reset this flag after we finish an order
			} else if (res.status == OrderStatus.CANCELED) {
				this.autoTrader.setPosition(currentPosition);
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

	isBelowMinimumNotional(qty, price) {
		if ((qty*price).toPrecision(this._PRECISION) < this._MIN_NOTIONAL) {
			console.log("Changing position due to minimum notional");
			this.msgBot.say("Changing position due to minimum notional");
			return true;
		}
		return false;
	}
}