#!/usr/bin/env node

"use strict";

import fs from 'fs';
import {
	isBaseEth,
	msToS,
	msToMin
} from './Utils.js';
import TickerData from './data/TickerData.js'
import TradeSum from './data/TradeSum.js'
import DataEngine from './DataEngine.js'
import AutoTrader from './AutoTrader.js'
import AlertBot from './AlertBot'

class Tracker {

	constructor(client) {
		this.client = client;
		this.msgBot = new AlertBot();
		// this.fStream = fs.createWriteStream('log.txt');
	}

	stop() {
		// this.fStream.end();
	}

	trackTrades(products) {
		this.client.ws.trades(products, trade => {
			this.printTrade(trade);
		})
	}

	trackTicker(symbol, wSize) {
		const de = new DataEngine(symbol, wSize, this.msgBot);
		const at = new AutoTrader(this.client, symbol, de, this.msgBot);
		at.start();
		// const logger = fs.createWriteStream(`logs/${symbol}.txt`);
		this.client.ws.ticker(symbol, ticker => {
			// console.log(`${msToS(ticker.eventTime)}\t${ticker.bestAsk}\t${ticker.bestBid}\n`);
			// logger.write(`${msToS(ticker.eventTime)}\t${ticker.bestAsk}\t${ticker.bestBid}\n`);
			de.enqueue(ticker);
		});
	}

	trackAllTickers() {
		this.client.ws.allTickers(products => {
			console.log(products);
		});
	}

	/*
		wSize = window size in minutes
		threshold = % change threshold to alert on
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
		console.log(msg);
	}
}

export {
	Tracker
}