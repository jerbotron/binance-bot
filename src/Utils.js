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

// return date string in format YYYY-MM-DD
function getDate() {
	return new Date().toISOString().slice(0,10);
}

export { isBaseEth, msToS, msToMin, getDate }