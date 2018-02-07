#!/usr/bin/env node

"use strict";

export default class TradeSum {
	constructor(price, size) {
		this.priceSum = parseFloat(price) * parseFloat(size);
		this.size = parseFloat(size);
	}

	getPriceSum() {
		return this.priceSum;
	}

	getSize() {
		return this.size;
	}

	addTrade(p, s) {
		this.priceSum += (parseFloat(p) * parseFloat(s));
		this.size += parseFloat(s);
	}
}