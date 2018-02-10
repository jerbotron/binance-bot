#!/usr/bin/env node

"use strict";

export default class StatData {

	constructor(ticker, ma, std) {
		this._ticker = ticker;
		this._ma = ma;
		this._std = std;
	}

	get ticker() {
		return this._ticker;
	}

	get ma() {
		return this._ma;
	}

	get std() {
		return this._std;
	}

}