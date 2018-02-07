#!/usr/bin/env node

"use strict";

export default class StatData {

	constructor(ticker, ema, std) {
		this._ticker = ticker;
		this._ema = ema;
		this._std = std;
	}

	get ticker() {
		return this._ticker;
	}

	get ema() {
		return this._ema;
	}

	get std() {
		return this._std;
	}

}