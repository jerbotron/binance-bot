#!/usr/bin/env node

"use strict";

import { BOLLINGER_BAND_FACTOR } from '../common/Constants.js'

export default class TickerData {

	// maArr = [askMa, bidMa], stdArr = [askStd, bidStd]
	constructor(timestamp, ask, bid, maArr, stdArr) {
		this._timestamp = parseInt(timestamp);
		this._ask = Number(ask);
		this._bid = Number(bid);
		this._maArr = maArr;
		this._stdArr = stdArr;
	}

	get timestamp() {
		return this._timestamp;
	}

	get ask() {
		return this._ask;
	}

	get bid() {
		return this._bid;
	}

	get askMa() {
		return this._maArr[0];
	}

	get bidMa() {
		return this._maArr[1];
	}

	get askSTD() {
		return this._stdArr[0];
	}

	get bidStd() {
		return this._stdArr[1];
	}

	getAskSpread() {
		return 2 * BOLLINGER_BAND_FACTOR * this._stdArr[0];
	}

	getBuySpread() {
		return 2 * BOLLINGER_BAND_FACTOR * this._stdArr[1];
	}

	getAskP90() {
		return this.getAskPercentile(90);
	}

	getBuyP90() {
		return this.getBuyPercentile(90);
	}

	getAskP10() {
		return this.getAskPercentile(10);
	}

	getBuyP10() {
		return this.getBuyPercentile(10);
	}

	getAskPercentile(percent) {
		let floor = this._maArr[0] - 2 * this._stdArr[0];
		return (floor + percent/100 * this.getAskSpread());
	}

	getBuyPercentile(percent) {
		let floor = this._maArr[1] - 2 * this._stdArr[1];
		return (floor + percent/100 * this.getBuySpread());
	}
}