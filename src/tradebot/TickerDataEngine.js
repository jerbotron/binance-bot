#!/usr/bin/env node

"use strict";

import fs from 'fs';
import Rx from 'rxjs/Rx';
import TickerData from '../dto/TickerData.js'
import { getDate } from '../common/Utils.js';

const USE_SMA = false;

/*
	Collect ticker dto for a single coin, analyze the dto in real time and
	emit trade signals and alerts
*/
export default class TickerDataEngine {

	constructor(msgBot, tradeParams) {
		this.symbol = tradeParams.SYMBOL;
		this.wSize = tradeParams.WINDOW_SIZE_S;
		this.msgBot = msgBot;
		this.dataArr = new Array(this.wSize);
		this.ma = [null, null];	// size 2 array [askMa, bidMa]
		this.std = [null, null];	// size 2 array [askStd, bidStd]
		let dataDir = `./logs/${getDate()}`;
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir);
		}
		this.logger = fs.createWriteStream(`logs/${getDate()}/${this.symbol}_stats.txt`);
		this.count = 0;

		this.tradeSubject = new Rx.Subject();
	}

	enqueue(ticker) {
		this.dataArr[this.count % this.wSize] = new Ticker(ticker.bestAsk, ticker.bestBid);
		this.count++;
		if (this.count >= this.wSize) {	
			this.calculateStats(ticker);
			this.logger.write(`${ticker.eventTime}\t${ticker.bestAsk}\t${ticker.bestBid}\t${this.ma[0]}\t${this.ma[1]}\t${this.std[0]}\t${this.std[1]}\n`)
		}
		if (this.count < this.wSize) {
			// let ceil = [this.ma[0] + BOLLINGER_BAND_FACTOR * this.std[0], this.ma[1] + BOLLINGER_BAND_FACTOR * this.std[1]];
			// let floor = [this.ma[0] - BOLLINGER_BAND_FACTOR * this.std[0], this.ma[1] - BOLLINGER_BAND_FACTOR * this.std[1]];
			// console.log(`${ticker.eventTime}\t${ticker.bestAsk}\t${floor[0]}\t${this.ma[0]}\t${ceil[0]}\t${ticker.bestBid}\t${floor[1]}\t${this.ma[1]}\t${ceil[1]}\n`);
			// console.log("Trading begins in: " + (this.wSize - this.count));
		}
	}

	calculateStats(ticker) {
		let u = this.calcAvg();
		this.ma = (USE_SMA || (this.ma[0] == null || this.ma[1] == null)) ? u : this.calcEma(ticker.bestAsk, ticker.bestBid);
		this.std = this.calcStd(u);
		if (this.count >= this.wSize) {
			this.tradeSubject.next(new TickerData(ticker.eventTime, ticker.bestAsk, ticker.bestBid, this.ma, this.std));
		}		
	}

	alertPriceChange() {
		return this.tradeSubject;
	}

	// Returns size 2 array [askAvg, bidAvg]
	calcAvg() {
		let askSum = 0, bidSum = 0;
		let size = 0
		this.dataArr.forEach(ticker => {
			if (ticker != null) {
				askSum += ticker.getAsk();
				bidSum += ticker.getBid();
				size++;
			}
		});
		return [askSum/size, bidSum/size];
	}

	// Returns size 2 array [askEma, bidEma]
	calcEma(ask, bid) {
		let weight = 2 / (this.wSize +1);
		let askEma = (ask - this.ma[0]) * weight + this.ma[0];
		let bidEma = (bid - this.ma[1]) * weight + this.ma[1];
		return [askEma, bidEma];
	}

	// Returns size 2 array [askStd, bidStd]
	calcStd(u) {
		let sum = [0 , 0];
		let size = 0;
		this.dataArr.forEach(ticker => {
			if (ticker != null) {
				sum[0] += Math.pow(ticker.getAsk() - u[0], 2);
				sum[1] += Math.pow(ticker.getBid() - u[1], 2);
				size++;
			}
		});
		return [Math.sqrt(sum[0]/size), Math.sqrt(sum[1]/size)];
	}

}

class Ticker {
	constructor(ask, bid) {
		this.ask = Number(ask);
		this.bid = Number(bid);
	}

	getAsk() {
		return this.ask;
	}

	getBid() {
		return this.bid;
	}
}