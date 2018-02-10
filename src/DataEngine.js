#!/usr/bin/env node

"use strict";

import fs from 'fs';
import Rx from 'rxjs/Rx';
import TickerSum from './data/TickerSum.js'
import StatData from './data/StatData.js'
import { getDate } from './Utils.js';

const BOLLINGER_BAND_FACTOR = 2;
const USE_SMA = false;

/*
	Collect data for a single coin ticker, analyze the data in real time and 
	emit trade signals and alerts
*/
export default class DataEngine {

	constructor(symbol, wSize, msgBot) {
		this.symbol = symbol;
		this.wSize = wSize;
		this.msgBot = msgBot;
		this.startTimestamp = null;
		this.dataArr = new Array(wSize);
		this.ma = [null, null];	// size 2 array [askMa, bidMa]
		this.std = [null, null];	// size 2 array [askStd, bidStd]
		this.logger = fs.createWriteStream(`data/${getDate()}/${this.symbol}_stats.txt`);
		this.count = 0;

		this.askSubject = new Rx.Subject();
		this.buySubject = new Rx.Subject();
	}

	enqueue(ticker) {
		this.dataArr[this.count % this.wSize] = new Ticker(ticker.bestAsk, ticker.bestBid);
		this.count++;
		if (this.count >= this.wSize) {
			if (this.count == this.wSize) {
				console.log("Trading began");
				this.msgBot.say("Trading began");
			}
			this.calculateStats(ticker);
			this.logger.write(`${ticker.eventTime}\t${ticker.bestAsk}\t${ticker.bestBid}\t${this.ma[0]}\t${this.ma[1]}\t${this.std[0]}\t${this.std[1]}\n`)
		}
		let ceil = [this.ma[0] + BOLLINGER_BAND_FACTOR * this.std[0], this.ma[1] + BOLLINGER_BAND_FACTOR * this.std[1]];
		let floor = [this.ma[0] - BOLLINGER_BAND_FACTOR * this.std[0], this.ma[1] - BOLLINGER_BAND_FACTOR * this.std[1]];
		// console.log(`${ticker.eventTime}\t${ticker.bestAsk}\t${floor[0]}\t${this.ma[0]}\t${ceil[0]}\t${ticker.bestBid.toString()}\t${floor[1]}\t${this.ma[1]}\t${ceil[1]}\n`);
	}

	calculateStats(ticker) {
		let u = this.calcAvg();
		this.ma = (USE_SMA || (this.ma[0] == null || this.ma[1] == null)) ? u : this.calcEma(ticker.bestAsk, ticker.bestBid);
		this.std = this.calcStd(u);
		this.askSubject.next(new StatData(ticker.bestAsk, this.ma[0], this.std[0]));
		this.buySubject.next(new StatData(ticker.bestBid, this.ma[1], this.std[1]));
	}

	alertAskPrice() {
		return this.askSubject;
	}

	alertBuyPrice() {
		return this.buySubject;
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
		this.ask = parseFloat(ask);
		this.bid = parseFloat(bid);
	}

	getAsk() {
		return this.ask;
	}

	getBid() {
		return this.bid;
	}
}