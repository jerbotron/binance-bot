#!/usr/bin/env node

"use strict";

export default class TradeSum {
	constructor() {
		this._sum = 0;
		this._qty = 0;
		this.prices = [];
		this.sizes = [];
	}

	get sum() {
		return this._sum;
	}

	get qty() {
		return this._qty;
	}

	addTrade(price, qty) {
		this._sum += (Number(price) * Number(qty));
		this._qty += Number(qty);
		this.prices.push(Number(price));
		this.sizes.push(Number(qty));
	}

	getSquaredSum(u) {
		let sum = 0;
		for (let i = 0; i < this.prices.length; i++) {
			sum += (Math.pow((this.prices[i] - u), 2) * this.sizes[i]);
		}
		return sum;
	}
}