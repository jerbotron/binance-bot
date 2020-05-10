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

function getPercentGain(sell, buy, feePercent) {
	return ((1-feePercent) * sell - (1+feePercent) * buy)/buy*100;
}

function round(n, precision) {
	return Number(n.toPrecision(precision));
}

// n must be a string
function increaseLowestDigit(n, symbol) {
	let d = 1;
	for (let i = n.length-1; i >= 0; i--) {
		if (n.charAt(i) === '.') {
			d = n.length - 1 - i;
			break;
		}
	}
	return (Number(n) + 1/Math.pow(10, d)).toFixed(8);
}

// n must be a string
function decreaseLowestDigit(n, symbol) {
	let d = 1;
	for (let i = n.length-1; i >= 0; i--) {
		if (n.charAt(i) === '.') {
			d = n.length - 1 - i
			break;
		}
	}
	return (Number(n) - 1/Math.pow(10, d)).toFixed(8);
}

const formatDate = date => {
	return date.toISOString().split('.')[0].replace('T', ' ')
};

module.exports = {
	isBaseEth, 
	msToS, 
	msToMin, 
	getDate,
	getPercentGain,
	round,
	formatDate
};