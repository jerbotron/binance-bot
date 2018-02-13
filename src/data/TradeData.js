#!/usr/bin/env node

"use strict";

import { BOLLINGER_BAND_FACTOR } from '../Constants.js'

export default class TradeData {

	// maArr = [askMa, bidMa], stdArr = [askStd, bidStd]
	constructor(ask, bid, maArr, stdArr) {
		this._ask = Number(ask);
		this._bid = Number(bid);
		this._maArr = maArr;
		this._stdArr = stdArr;
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
		let ceil = this._maArr[0] + 2 * this._stdArr[0];
		let floor = this._maArr[0] - 2 * this._stdArr[0];
		return (ceil - floor);
	}

	getBuySpread() {
		let ceil = this._maArr[1] + 2 * this._stdArr[1];
		let floor = this._maArr[1] - 2 * this._stdArr[1];
		return (ceil - floor);
	}

	getAskP90() {
		return (this._ask + 0.90 * this.getAskSpread());
	}

	getBuyP90() {
		return (this._bid + 0.90 * this.getBuySpread());	
	}

	getAskP10() {
		return (this._ask + 0.10 * this.getAskSpread());
	}

	getBuyP10() {
		return (this._bid + 0.10 * this.getBuySpread());	
	}
}