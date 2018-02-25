#!/usr/bin/env node

"use strict";

import fs from 'fs';
import Rx from 'rxjs/Rx';
import TradeSum from './data/TradeSum.js'
import TradeData from './data/TradeData.js'
import TickerData from './data/TickerData.js'
import { 
	msToS,
	getDate 
} from './Utils.js';

/*
	Collect trade data for a single coin, analyze the data in real time and 
	emit trade signals and alerts
*/
export default class DataEngine {

	constructor(msgBot, tradeParams) {
		this.symbol = tradeParams.SYMBOL;
		this.wSize = tradeParams.WINDOW_SIZE_S;
		this.msgBot = msgBot;
		this.startTimestamp = null;
		this.dataMap = new Map();
		this.ma = null;
		this.std = null;
		let dataDir = `./logs/${getDate()}`;
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir);
		}
		this.logger = fs.createWriteStream(`logs/${getDate()}/${this.symbol}_trade_stats.txt`);

		this.tradeSubject = new Rx.Subject();
		this.tickerSubject = new Rx.Subject();

		this.countdown = 0;
	}

	alertPriceChange() {
		return this.tradeSubject;
	}

	alertTickerChange() {
		return this.tickerSubject;
	}

	enqueueTicker(ticker) {
		this.tickerSubject.next(new TickerData(ticker.eventTime, ticker.bestAsk, ticker.bestBid));
	}

	enqueueTrade(trade) {
		let timestamp = msToS(trade.eventTime);

		if (!this.startTimestamp) {
			this.startTimestamp = timestamp;
		}

		if (!this.dataMap.has(timestamp)) {
			this.dataMap.set(timestamp, new TradeSum());
		}
		this.dataMap.get(timestamp).addTrade(trade.price, trade.quantity);

		if (timestamp - this.startTimestamp >= this.wSize) {
			this.calculateStats(trade, timestamp);
			for (let i = this.startTimestamp; i <= timestamp - this.wSize; i++) {
				this.dataMap.delete(i);
			}
			this.startTimestamp = timestamp - this.wSize;
		} else {
			let n = this.wSize - (timestamp - this.startTimestamp);
			if (n !== this.countdown) {
				this.countdown = n;
				console.log(`Beginning trade in ${this.countdown}`);
			}
		}
	}

	calculateStats(trade, timestamp) {
		this.ma = this.calcAvg(timestamp);
		this.std = this.calcStd(this.ma, timestamp);
		this.tradeSubject.next(new TradeData(timestamp, trade.price, this.ma, this.std));
		// console.log(`${timestamp}\t${trade.price}\t${this.ma}\t${this.std}\n`);
		this.logger.write(`${timestamp}\t${trade.price}\t${trade.quantity}\t${this.ma}\t${this.std}\n`)
	}

	// calculates weighted avg
	calcAvg(curTimestamp) {
		let sum = 0, size = 0;
		for (let i = curTimestamp; i > curTimestamp - this.wSize; i--) {
			if (this.dataMap.has(i)) {
				sum += this.dataMap.get(i).sum;
				size += this.dataMap.get(i).qty;
			}
		}
		return sum/size;
	}

	calcStd(u, curTimestamp) {
		let sum = 0, size = 0;
		for (let i = curTimestamp; i > curTimestamp - this.wSize; i--) {
			if (this.dataMap.has(i)) {
				sum += this.dataMap.get(i).getSquaredSum(u);
				size += this.dataMap.get(i).qty;
			}
		}
		return Math.sqrt(sum/size);
	}
}