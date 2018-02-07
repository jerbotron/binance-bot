#!/usr/bin/env node

"use strict";

import { Tracker } from './src/Tracker'
import { app } from './src/Webhook'

import Binance from 'binance-api-node'

const CONFIG = require("./config.json");

app.listen(8080, () => console.log('Jerbotron webhook listening on port 8080...'));

const tracker = new Tracker();

// tracker.trackAllEth(1, 3);
tracker.trackTicker('VENBNB', 300);

// const client = Binance({
// 	apiKey: CONFIG.API_KEY,
// 	apiSecret: CONFIG.API_SECRET
// });

// testOrder();
// getOrder();

process.on("SIGINT", () => {
	tracker.stop();
	process.exit(0);
});

// async function testOrder() {
// 	try {
// 		console.log(await client.order({
// 			symbol: 'VENETH',
// 			side: 'BUY',
// 			quantity: 10,
// 			price: 0.00571,
// 		}));
// 	} catch(e) {
// 		console.log(e);
// 	}
// }

// async function getOrder() {
// 	try {
// 		console.log(await client.getOrder({
// 			symbol: 'VENBNB',
// 			origClientOrderId: '1YHLL0kTe4xtBwMzpM0AwN'
// 		}));
// 		// console.log("t = " + t);
// 	} catch(e) {
// 		console.log(e);
// 	}
// }

// const OrderStatus = Object.freeze({
// 	NEW: 'NEW',
// 	FILLED: 'FILLED',
// 	CANCELED: 'CANCELED',
// 	REJECTED: 'REJECTED',
// 	EXPIRED: 'EXPIRED',
// 	ERRORED: 'ERRORED'
// });

// const Position = Object.freeze({
// 	BUY: 'BUY',
// 	SELL: 'SELL',
// 	PENDING: 'PENDING'
// });

// function waitForOrder() {
// 	pollOrderStatus((status) => {
// 		console.log(`Polled for order status: ${status}`);
// 		switch (status) {
// 			case OrderStatus.FILLED: {
// 				return true;
// 			}
// 			case OrderStatus.CANCELED:
// 			case OrderStatus.REJECTED:
// 			case OrderStatus.EXPIRED:
// 			case OrderStatus.ERRORED: {
// 				return true;
// 			}
// 			default:
// 				return false;
// 		}
// 	}, 500)
// 	.then((res) => {
// 		if (res.status == OrderStatus.FILLED) {
// 			let msg = "";
// 			if (res.side == Position.BUY) {					
// 				msg = `Bought ${res.executedQty} of ${res.symbol} @ ${res.price}`;
// 			} else if (res.side == Position.SELL) {
// 				msg = `Sold ${res.executedQty} of ${res.symbol} @ ${res.price}\n`;
// 			}
// 			console.log(msg);
// 		}
// 	})
// 	.catch((e) => {
// 		console.log(e);
// 	});
// }

// function pollOrderStatus(isOrderFinished, interval) {
// 	var checkCondition = async (resolve, reject) => {
// 		try {
// 			var res = await client.getOrder({
// 				symbol: 'VENETH',
// 				origClientOrderId: 'L1VG7izhpMQsx5uJdIhFsV'
// 			});
// 			if (isOrderFinished(res.status)) {
// 				resolve(res);
// 			} else {
// 				setTimeout(checkCondition, interval, resolve, reject);
// 			}
// 		} catch(e) {
// 			reject(new Error("Polling errored out: " + e));
// 		}
// 	};

// 	return new Promise(checkCondition);
// }

// waitForOrder();