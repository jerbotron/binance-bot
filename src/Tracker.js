#!/usr/bin/env node

"use strict";

import Binance from 'binance-api-node'
import fs from 'fs';

class Tracker {

	constructor(msgBot) {
		this.msgBot = msgBot;
		this.client = Binance();
		this.avgMap = {};
		this.fStream = fs.createWriteStream('log.txt');
		this.fStream.on('finish', () => {
			console.log("finished collecting data to file");
		});
	}

	stop() {
		this.fStream.end();
	}

	trackAllEth() {
		console.log(`WeightedAvg\tBestBid \tBestAsk \tPriceChange \tOpen`);
		this.client.ws.allTickers(tickers => {
			tickers.forEach(product => {
				if (isBaseEth(product)) {
					// if (!this.percentMap[product.symbol]) {
					// 	this.percentMap[product.symbol] = 
					// }
					// if (product.symbol == 'TRXETH') {
					// 	console.log(`${product.weightedAvg}\t${product.bestBid}\t${product.bestAsk}\t${product.priceChange}\t${product.open}`);
					// }
				}
			});
		});
	}

	trackTrades(products) {
		this.client.ws.trades(products, trade => {
			this.printTrade(trade);
		})
	}

	getMWA(product, wSize) {
		let mwaArr = new Array(wSize);
		let startTimestamp = -1;
		let lastMWA = -1;
		this.client.ws.trades([product], trade => {
			if (trade.eventType == 'aggTrade') {
				// this.printTrade(trade);s
				let timestamp = msToS(trade.eventTime);

				if (startTimestamp < 0) {
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
					mwaArr[index].addPriceSum(trade.price, trade.quantity);
					mwaArr[index].addSize(trade.quantity);
				}
			}
		});
	}

	printMWA(mwaArr, lastMWA) {
		let priceSum = 0;
		let size = 0;
		mwaArr.forEach(tradeSum => {
			// if (tradeSum) {
			// 	console.log("tradeSum = " + tradeSum.getPriceSum() + ", " + tradeSum.getSize());
			// }
			if (tradeSum) {
				priceSum += tradeSum.getPriceSum();
				size += tradeSum.getSize();
			}
		});

		let currMWA = priceSum / size;
		let percentChange = (lastMWA > 0) ? (currMWA - lastMWA) / lastMWA * 100 : 0;
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

	printArray(arr) {
		console.log(`[${arr.map(x => x).join('\t')}]`);
	}
}

function isBaseEth(product) {
	return product.symbol.endsWith('ETH');
}

function msToS(ms) {
	return Math.round(ms / 1000);
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

	addPriceSum(p, s) {
		this.priceSum += (parseFloat(p) * parseFloat(s));
	}

	addSize(s) {
		this.size += parseFloat(s);
	}
}

export {
	Tracker
}