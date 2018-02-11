#!/usr/bin/env node

"use strict";

const CONFIG = require("../config.json");
const plotly = require("plotly")(CONFIG.PLOTLY_USERNAME, CONFIG.PLOTLY_API_KEY);

const WINDOW_SIZE_S = 300;
const BOLLINGER_BAND_FACTOR = 2;

// return date string in format YYYY-MM-DD
function getDate() {
	return new Date().toISOString().slice(0,10);
}

class DataPlotter {

	constructor() {
		this.askData = new Data();
		this.bidData = new Data();
		this.tradeData = new TradeData();

		this.lineReader = require("readline").createInterface({
			// input: require("fs").createReadStream(`./data/${getDate()}/VENBNB_stats.txt`)
			input: require("fs").createReadStream("./data/temp.txt")
		});

		this.lineReader.on("close", () => {
			this.plot("ETHUSDT");
		});
	}

	plot(name) {
		var options = { fileopt: "overwrite", filename: name };
		var plotData = [
			this.askData.getDataTrace("Ask Ticker"), 
			this.askData.getEmaTrace("Ask EMA"),
			this.askData.getFloorTrace("Ask Floor"),
			this.askData.getCeilTrace("Ask Ceil"),
			this.bidData.getDataTrace("Bid Ticker"), 
			this.bidData.getEmaTrace("Bid EMA"),
			this.bidData.getFloorTrace("Bid Floor"),
			this.bidData.getCeilTrace("Bid Ceil"),
			this.tradeData.getSellTrace(),
			this.tradeData.getSoldTrace(),
			this.tradeData.getBuyTrace(),
			this.tradeData.getBoughtTrace(),
		];

		plotly.plot(plotData, options, function(err, msg) {
			if (err) return console.log(err);
			console.log(msg);
		});
	}

	processStatData() {
		this.lineReader.on("line", line => {
			let row = line.split("\t");
			this.processStatDataRow(row);
		});
	}

	// stats_data colunmns:
	// timestamp   bestAsk   bestBid   askEma   bidEma   askStd   bidStd
	processStatDataRow(row) {
		if (row[0] == 'SELL' || row[0] == 'BUY' || row[0] == 'SOLD' || row[0] == 'BOUGHT') {
			this.tradeData.append(row[0], row[1], row[3]);
		} else {
			this.askData.append(row[0], row[1], row[3], row[5]);
			this.bidData.append(row[0], row[2], row[4], row[6]);
		}
	}

	processRawData() {
		let n = 0;
		// lineReader.on("line", line => {
		// 	let row = line.split("\t");
		// 	// Create raw data set
		// 	data.push(arr[2]);
		// 	time.push(parseInt(arr[0]));
		// 	emaData.push(arr[4]);
		// 	stdDataCeil.push(parseFloat(arr[4]) + parseFloat(arr[6]) * BOLLINGER_BAND_FACTOR);
		// 	stdDataFloor.push(parseFloat(arr[4]) - parseFloat(arr[6]) * BOLLINGER_BAND_FACTOR);
		// 	n++;
		// 	if (n >= period) {
		// 		// EMA
		// 		if (prevEma == null) {
		// 			prevEma = calcAvg(data.slice(0, period));
		// 			emaData.push(prevEma);
		// 		} else {
		// 			let ema = calcEma(data[n-1], prevEma, period);
		// 			emaData.push(ema);
		// 			prevEma = ema;
		// 		}

		// 		// Standard Deviation
		// 		let std = calcStd(data.slice(n-period, n));
		// 		stdDataCeil.push(prevEma + std*BOLLINGER_BAND_FACTOR);
		// 		stdDataFloor.push(prevEma - std*BOLLINGER_BAND_FACTOR);
		// 		maTime.push(n);
		// 	}
		// });
	}

	// raw_data colunmns:
	// timestamp   bestAsk   bestBid
	processRawDataRow(row) {
		// todo
	}
}

class Data {
	constructor() {
		this.data = [];
		this.ema = [];
		this.std = [];
		this.time = [];
		this.floor = [];
		this.ceil = [];
	}

	append(time, data, ema, std) {
		this.data.push(data);
		this.ema.push(ema);
		this.std.push(std);
		this.time.push(time);
		this.floor.push(Number(ema) - BOLLINGER_BAND_FACTOR * Number(std));
		this.ceil.push(Number(ema) + BOLLINGER_BAND_FACTOR * Number(std));
	}

	getDataTrace(name) {
		return {
			x: this.time,
			y: this.data,
			name: name,
			type: "scatter"
		};
	}

	getEmaTrace(name) {
		return {
			x: this.time,
			y: this.ema,
			name: name,
			type: "scatter"
		};
	}

	getFloorTrace(name) {
		return {
			x: this.time,
			y: this.floor,
			name: name,
			type: "scatter"
		};
	}

	getCeilTrace(name) {
		return {
			x: this.time,
			y: this.ceil,
			name: name,
			type: "scatter"
		};
	}
}

class TradeData {

	constructor() {
		this.sellData = [];
		this.sellTime = [];
		this.buyData = [];
		this.buyTime = [];
		this.soldData = [];
		this.soldTime = [];
		this.boughtData = [];
		this.boughtTime = [];
	}

	append(orderType, timestamp, price) {
		if (orderType == 'SELL') {
			this.sellData.push(Number(price));
			this.sellTime.push(Number(timestamp));
		} else if (orderType == 'BUY') {
			this.buyData.push(Number(price));
			this.buyTime.push(Number(timestamp));
		} else if (orderType == 'SOLD') {
			this.soldData.push(Number(price));
			this.soldTime.push(Number(timestamp));
		} else if (orderType == 'BOUGHT') {
			this.boughtData.push(Number(price));
			this.boughtTime.push(Number(timestamp));
		}
	}

	getSellTrace() {
		return {
			x: this.sellTime,
			y: this.sellData,
			name: "Sell Markers",
			type: "scatter",
			mode: "markers",
			marker: {
				size: 12,
			    line: {
			    	color: "white",
			    	width: 0.5
			    }
			}
		}
	}

	getBuyTrace() {
		return {
			x: this.buyTime,
			y: this.buyData,
			name: "Buy Markers",
			type: "scatter",
			mode: "markers",
			marker: {
				size: 12,
			    line: {
			    	color: "white",
			    	width: 0.5
			    }
			}
		}
	}

	getSoldTrace() {
		return {
			x: this.soldTime,
			y: this.soldData,
			name: "Sold Markers",
			type: "scatter",
			mode: "markers",
			marker: {
				size: 12,
			    line: {
			    	color: "white",
			    	width: 0.5
			    }
			}
		}
	}

	getBoughtTrace() {
		return {
			x: this.boughtTime,
			y: this.boughtData,
			name: "Bought Markers",
			type: "scatter",
			mode: "markers",
			marker: {
				size: 12,
			    line: {
			    	color: "white",
			    	width: 0.5
			    }
			}
		}
	}
}

function calcSma(begin, close, prev, period) {
	return prev + (close - begin) / period;
}

function calcEma(close, prev, period) {
	let weight = 2/(period + 1);
	let ema = (close - prev) * weight + prev;
	return ema;
}

function calcAvg(data) {
	let total = 0;
	data.forEach(n => {
		total += parseFloat(n);
	});
	return total/data.length;
}

function calcStd(data) {
	let u = calcAvg(data);
	let sum = 0;
	data.forEach(n => {
		sum += Math.pow(parseFloat(n)-u, 2);
	});
	return Math.sqrt(sum/data.length);
}

const dp = new DataPlotter();
dp.processStatData();

