#!/usr/bin/env node

"use strict";

import fs from 'fs';
import {
	isBaseEth,
	msToS,
	msToMin
} from '../Utils.js';
import TickerSum from '../data/TickerSum.js'

export default class TickerData {
	constructor(msgBot, symbol, wSize, alertThreshold) {
		this.symbol = symbol;
		this.msgBot = msgBot;
		this.wSize = wSize;
		this.alertThreshold = alertThreshold;
		// this.logger = fs.createWriteStream(`logs/${this.symbol}_ticker_data.txt`);
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

		// this.logger.write(`${timestamp}\t${ticker.bestAsk}\t${ticker.bestAskQnt}\t${ticker.bestBid}\t${ticker.bestBidQnt}\n`)
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