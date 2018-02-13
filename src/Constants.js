#!/usr/bin/env node

"use strict";

const BOLLINGER_BAND_FACTOR = 2;

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

const FilterType = Object.freeze({
	PRICE_FILTER: 'PRICE_FILTER',
	LOT_SIZE: 'LOT_SIZE',
	MIN_NOTIONAL: 'MIN_NOTIONAL'
});

export {
	BOLLINGER_BAND_FACTOR,
	Position,
	OrderStatus,
	OrderType,
	FilterType
}