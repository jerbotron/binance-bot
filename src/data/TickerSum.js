#!/usr/bin/env node

"use strict";

export default class TickerSum {
	constructor() {
		this._askSum = 0;
		this._bidSum = 0;
		this._size = 0;
	}

	get askSum() {
		return this._askSum;
	}

	get bidSum() {
		return this._bidSum;
	}

	get size() {
		return this._size;
	}

	addTicker(ask, bid) {
		this._askSum += Number(ask);
		this._bidSum += Number(bid);
		this._size++;
	}

	getAskAvg() {
		return this._askSum/this._size;
	}

	getBidAvg() {
		return this._bidSum/this._size;
	}
}