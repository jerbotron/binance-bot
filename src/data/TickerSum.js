#!/usr/bin/env node

"use strict";

export default class TickerSum {
	constructor() {
		this.askSum = 0;
		this.bidSum = 0;
		this.size = 0;
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

	getAskAvg() {
		return this.askSum / this.size;
	}

	getBidAvg() {
		return this.bidSum / this.size;
	}
}