#!/usr/bin/env node

"use strict";

function isBaseEth(product) {
	return product.symbol.endsWith('ETH');
}

function msToS(ms) {
	return Math.round(ms / 1000);
}

function msToMin(ms) {
	return Math.round(ms / 1000 / 60);
}

export { isBaseEth, msToS, msToMin}