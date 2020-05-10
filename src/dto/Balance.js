#!/usr/bin/env node

"use strict";

export default class Balance {

	constructor(symbol, qty) {
		this._symbol = symbol;
		this._qty = Number(qty);
		this._orig_qty = Number(qty);
	}

	get symbol() {
		return this._symbol;
	}

	get qty() {
		return this._qty;
	}

	get origQty() {
		return this._orig_qty;
	}

	get percentChange() {
		return (this._qty / this._orig_qty) - 1;
	}

	addQty(qty) {
		this._qty += Number(qty);
	}

	subtractQty(qty) {
		this._qty -= Number(qty);
	}
}