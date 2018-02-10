#!/usr/bin/env node

"use strict";

const Position = Object.freeze({
	BUY: 'BUY',
	SELL: 'SELL',
	PENDING: 'PENDING'
});

const OrderStatus = Object.freeze({
	NEW: 'NEW',
	PARTIALLY_FILLED: 'PARTIALLY_FILLED',
	FILLED: 'FILLED',
	CANCELED: 'CANCELED',
	REJECTED: 'REJECTED',
	EXPIRED: 'EXPIRED',
	ERRORED: 'ERRORED'
});

const OrderType = Object.freeze({
	LIMIT: 'LIMIT',
	MARKET: 'MARKET'
});

// number of decimal places Binance allows order prices to have up to 
const SymbolDecimals = Object.freeze({
	'VENBNB': 4,
	'BNBUSDT': 4
});

export {
	Position,
	OrderStatus,
	OrderType,
	SymbolDecimals
}