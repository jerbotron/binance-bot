#!/usr/bin/env node

"use strict";

import fs from 'fs';
import Rx from 'rxjs/Rx';
import TickerSum from './data/TickerSum.js'

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
		this.ema = [null, null];	// size 2 array [askEma, bidEma]
		this.std = [null, null];	// size 2 array [askEma, bidEma]
		this.logger = fs.createWriteStream(`logs/${this.symbol}_stats123.txt`);
		this.count = 0;
	}

	enqueue(ticker) {
		this.dataArr[this.count % this.wSize] = new Ticker(ticker.bestAsk, ticker.bestBid);
		this.count++;
		if (this.count >= this.wSize) {
			this.calculateStats(ticker);
			this.logger.write(`${ticker.eventTime}\t${ticker.bestAsk}\t${ticker.bestBid}\t${this.ema[0]}\t${this.ema[1]}\t${this.std[0]}\t${this.std[1]}\n`)
		}
		console.log(`${ticker.eventTime}\t${ticker.bestAsk}\t${ticker.bestBid}\t${this.ema[0]}\t${this.ema[1]}\t${this.std[0]}\t${this.std[1]}\n`);
	}

	calculateStats(ticker) {
		let dataSnapshot = this.dataArr.slice();
		if (this.ema == null) {
			this.ema = this.calcAvg(this.dataArr);
		} else {
			this.calcEma(ticker, this.ema).subscribeOn(Rx.Scheduler.default).observeOn(Rx.Scheduler.currentThread).subscribe(
				x => {
					this.ema = x;
				},
				e => {
					console.log('onError: %s', e);
				},
				() => {
					console.log('UpdateEMA onCompleted');
				}
			)
		}

		this.calcStd(dataSnapshot).subscribeOn(Rx.Scheduler.default).observeOn(Rx.Scheduler.currentThread).subscribe(
			x => {
				this.std = x;
			},
			e => {
				console.log('onError: %s', e);
			},
			() => {
				console.log('UpdateEMA onCompleted');
			}
		)
	}

	// Returns size 2 array [askAvg, bidAvg]
	calcAvg(data) {
		let askSum = 0, bidSum = 0;
		let size = 0
		data.forEach(ticker => {
			if (ticker != null) {
				askSum += ticker.getAsk();
				bidSum += ticker.getBid();
				size++;
			}
		});
		return [askSum/size, bidSum/size];
	}

	// Returns size 2 array [askEma, bidEma]
	calcEma(ticker, prevEma) {
		return Rx.Observable.create(observer => {
			let weight = 2 / (this.wSize +1);
			let askEma = (ticker.bestAsk - prevEma[0]) * weight + prevEma[0];
			let bidEma = (ticker.bestBid - prevEma[1]) * weight + prevEma[1];
			observer.onNext([askEma, bidEma]);
		});
	}

	// Returns size 2 array [askStd, bidStd]
	calcStd(data) {
		return Rx.Observable.create(observer => {
			let u = this.calcAvg(data);
			let sum = [0 , 0];
			let size = 0;
			data.forEach(ticker => {
				if (ticker != null) {
					sum[0] += Math.pow(ticker.getAsk() - u[0], 2);
					sum[1] += Math.pow(ticker.getBid() - u[1], 2);
					size++;
				}
			});
			observer.onNext([Math.sqrt(sum[0]/size), Math.sqrt(sum[1]/size)]);
		});
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