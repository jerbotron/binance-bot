#!/usr/bin/env node

"use strict";

import { BOLLINGER_BAND_FACTOR } from '../common/Constants.js'

export default class TradeData {

	constructor(timestamp, price, ma, std) {
		this._timestamp = parseInt(timestamp);
		this._price = Number(price);
		this._ma = Number(ma);
		this._std = Number(std);
		this._floor = this._ma - BOLLINGER_BAND_FACTOR * this._std;
		this._ceil = this._ma + BOLLINGER_BAND_FACTOR * this._std;
	}

	get timestamp() {
		return this._timestamp;
	}

	get price() {
		return this._price;
	}

	get ma() {
		return this._ma;
	}

	get std() {
		return this._std;
	}

	get floor() {
		return this._floor;
	}

	get ceil() {
		return this._ceil;
	}

	getSpread() {
		return this._ceil - this._floor;
	}

	getPercentile(percent) {
		return this._floor + percent/100 * this.getSpread();
	}

	getP90() {
		return this.getPercentile(90);
	}

	getP10() {
		return this.getPercentile(10);
	}
}