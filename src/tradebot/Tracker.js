#!/usr/bin/env node

"use strict";

import {
	isBaseEth,
	msToS,
	msToMin,
	getDate
} from '../common/Utils.js';
import TickerData from '../dto/TickerData.js'

export default class Tracker {

	constructor(client, dataEngine, msgBot) {
		this.client = client;
		this.dataEngine = dataEngine;
		this.msgBot = msgBot;
		// this.fStream = fs.createWriteStream('./logs/trades.txt');
	}

	stop() {
		if (this.fStream) {
			this.fStream.end();
		}
	}

	trackTrades(products) {
		this.client.ws.trades(products, trade => {
			// this.printTrade(trade);
			this.dataEngine.enqueueTrade(trade);
		})
	}

	trackTicker(symbol) {
		// const logger = fs.createWriteStream(`logs/${getDate()}/${symbol}.txt`);
		this.client.ws.ticker(symbol, ticker => {
			// logger.write(`${msToS(ticker.eventTime)}\t${ticker.bestAsk}\t${ticker.bestBid}\n`);
			this.dataEngine.enqueueTicker(ticker);
		});
	}

	/*
		wSize = window size in minutes
		threshold = % change threshold to alert on
	*/
	trackAllEth(wSize, threshold) {
		const trackerMap = {};
		this.client.ws.allTickers(products => {
			products.forEach(ticker => {
				if (isBaseEth(ticker)) {
				// if (ticker.symbol == "TRXETH") {
					if (!trackerMap[ticker.symbol]) {
						trackerMap[ticker.symbol] = new TickerData(this.msgBot, ticker.symbol, wSize, threshold);
					}
					trackerMap[ticker.symbol].enqueueTicker(ticker);
				}
			});
		});
	}

	printTrade(trade) {
		console.log(`${msToS(trade.eventTime)}\t${trade.price}\t${trade.quantity}`);
		// let msg = `Time: ${msToS(trade.eventTime)} \tPrice: ${trade.price} \t Size: ${trade.quantity}`;
		// console.log(msg);
	}
}