#!/usr/bin/env node

"use strict";

import Binance from 'binance-api-node';
import fs from 'fs';
import {
	isBaseEth,
	msToS,
	msToMin
} from './Utils.js';

class Tracker {

	constructor(msgBot) {
		this.msgBot = msgBot;
		this.client = Binance();
		this.fStream = fs.createWriteStream('log.txt');
		this.fStream.on('finish', () => {
			console.log("finished collecting data to file");
		});
	}

	stop() {
		this.fStream.end();
	}

	trackTrades(products) {
		this.client.ws.trades(products, trade => {
			this.printTrade(trade);
		})
	}

	trackTicker(product) {
		this.client.ws.ticker(product, ticker => {
			console.log(ticker);
		});
	}

	trackAllTickers() {
		this.client.ws.allTickers(products => {
			console.log(products);
		});
	}

	/*
		wSize = window size in minutes
	*/
	trackAllEth(wSize, threshold) {
		const trackerMap = {};
		this.client.ws.allTickers(products => {
			products.forEach(ticker => {
				if (isBaseEth(ticker)) {
				// if (ticker.symbol == "TRXETH") {
					if (!trackerMap[ticker.symbol]) {
						trackerMap[ticker.symbol] = new TickerData(this.msgBot, ticker.symbol, wSize, threshold);
					}
					trackerMap[ticker.symbol].enqueueTicker(ticker);
				}
			});
		});
	}

	getMWA(product, wSize) {
		let mwaArr = new Array(wSize);
		let startTimestamp = undefined;
		let lastMWA = undefined;
		this.client.ws.trades([product], trade => {
			if (trade.eventType == 'aggTrade') {
				// this.printTrade(trade);
				let timestamp = msToS(trade.eventTime);

				if (!startTimestamp) {
					startTimestamp = timestamp;
				} else if ((timestamp - startTimestamp) >= wSize) {
					lastMWA = this.printMWA(mwaArr, lastMWA);
					for (let i = startTimestamp; i <= timestamp - wSize; i++) {
						mwaArr[i % wSize] = undefined;
					}
					startTimestamp++;
				}

				let index = timestamp % wSize;
				if (mwaArr[index] == undefined) {
					mwaArr[index] = new TradeSum(trade.price, trade.quantity);
				} else {
					mwaArr[index].addTrade(trade.price, trade.quantity);
				}
			}
		});
	}

	printMWA(mwaArr, lastMWA) {
		let priceSum = 0;
		let size = 0;
		mwaArr.forEach(tradeSum => {
			if (tradeSum) {
				priceSum += tradeSum.getPriceSum();
				size += tradeSum.getSize();
			}
		});

		let currMWA = priceSum / size;
		let percentChange = (lastMWA) ? (currMWA - lastMWA) / lastMWA * 100 : 0;
		// console.log(`PriceSum: ${priceSum} \t Size: ${size} \tMWA: ${currMWA}`);
		let msg = `MWA: ${currMWA}\tPercentChange: ${percentChange}`;
		console.log(msg);
		this.msgBot.say(msg);
		return currMWA;
	}

	printTrade(trade) {
		// console.log(`${msToS(trade.eventTime)} \t${trade.price} \t${trade.quantity}`);
		let msg = `Time: ${msToS(trade.eventTime)} \tPrice: ${trade.price} \t Size: ${trade.quantity}`;
		this.fStream.write(`${msg}\n`);
		console.log(msg);
	}
}

class TickerData {
	constructor(msgBot, symbol, wSize, alertThreshold) {
		this.symbol = symbol;
		this.msgBot = msgBot;
		this.wSize = wSize;
		this.alertThreshold = alertThreshold;
		this.logger = fs.createWriteStream(`logs/${this.symbol}.txt`);
		this.maArr = new Array(wSize);
		this.startTimestamp = undefined;
		this.lastMA = undefined; // size 2 array [askMA, bidMA]
	}

	enqueueTicker(ticker) {
		let timestamp = msToMin(ticker.eventTime);

		if (!this.startTimestamp) {
			this.startTimestamp = timestamp;
		} else if (timestamp - this.startTimestamp >= this.wSize) {
			this.tryAlert(ticker);
			for (let i = this.startTimestamp; i <= timestamp - this.wSize; i++) {
				this.maArr[i % this.wSize] = undefined;
			}
			this.startTimestamp++;
		}

		let index = timestamp % this.wSize;
		if (this.maArr[index] == undefined) {
			this.maArr[index] = new TickerSum(ticker.bestAsk, ticker.bestBid);
		} else {
			this.maArr[index].addTicker(ticker.bestAsk, ticker.bestBid);
		}
	}

	// return [askMA, bidMA] array
	getMA() {
		let totalAsk = 0;
		let totalBid = 0;
		let totalSize = 0;
		this.maArr.forEach(tickerSum => {
			if (tickerSum) {
				totalAsk += tickerSum.getAskSum();
				totalBid += tickerSum.getBidSum();
				totalSize += tickerSum.getSize();
			}
		});

		return [totalAsk / totalSize, totalBid / totalSize];
	}

	tryAlert(ticker) {
		if (!this.lastMA) {
			this.lastMA = this.getMA();
			// console.log(`Alert: ${this.symbol} first MA collected at ${this.lastMA}`);
			return;
		}

		let ma = this.getMA();
		let askPercentChange = (ma[0] / this.lastMA[0] - 1) * 100;
		let bidPercentChange = (ma[1] / this.lastMA[1] - 1) * 100;
		this.logger.write(`${ma[0]}\t${askPercentChange}\t${ticker.bestAsk}\t${ticker.bestAskQnt}\t${ma[1]}\t${bidPercentChange}\t${ticker.bestBid}\t${ticker.bestBidQnt}\n`)

		if (Math.abs(askPercentChange) >= this.alertThreshold) {
			let action = (askPercentChange >= 0) ? "rose" : "dropped";
			console.log(`Alert: ${this.symbol} ask price just ${action} by ${askPercentChange} from ${this.lastMA[0]} to ${ma[0]}`);
			this.msgBot.say(`Alert: ${this.symbol} ask price just ${action} by ${askPercentChange} from ${this.lastMA[0]} to ${ma[0]}`);
		}
		if (Math.abs(bidPercentChange) >= this.alertThreshold) {
			let action = (bidPercentChange >= 0) ? "rose" : "dropped";
			console.log(`Alert: ${this.symbol} bid price just ${action} by ${bidPercentChange} from ${this.lastMA[1]} to ${ma[1]}`);
			this.msgBot.say(`Alert: ${this.symbol} bid price just ${action} by ${bidPercentChange} from ${this.lastMA[1]} to ${ma[1]}`);
		}

		this.lastMA = ma;
	}
}

class TickerSum {
	constructor(ask, bid) {
		this.askSum = parseFloat(ask);
		this.bidSum = parseFloat(bid);
		this.size = 1;
	}

	getAskSum() {
		return this.askSum;
	}

	getBidSum() {
		return this.bidSum;
	}

	getSize() {
		return this.size;
	}

	addTicker(ask, bid) {
		this.askSum += parseFloat(ask);
		this.bidSum += parseFloat(bid);
		this.size++;
	}
}

class TradeSum {
	constructor(price, size) {
		this.priceSum = parseFloat(price) * parseFloat(size);
		this.size = parseFloat(size);
	}

	getPriceSum() {
		return this.priceSum;
	}

	getSize() {
		return this.size;
	}

	addTrade(p, s) {
		this.priceSum += (parseFloat(p) * parseFloat(s));
		this.size += parseFloat(s);
	}
}

export {
	Tracker
}