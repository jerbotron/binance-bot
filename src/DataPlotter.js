#!/usr/bin/env node

"use strict";

const CONFIG = require("../config.json");
const plotly = require("plotly")(CONFIG.PLOTLY_USERNAME, CONFIG.PLOTLY_API_KEY);

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
			input: require("fs").createReadStream(`./logs/2018-02-12/ETHUSDT_stats.txt`)
		});

		this.lineReader.on("close", () => {
			this.plot("ETHUSDT-raw");
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
			// this.tradeData.getSoldTrace(),
			this.tradeData.getBuyTrace(),
			// this.tradeData.getBoughtTrace(),
		];

		plotly.plot(plotData, options, function(err, msg) {
			if (err) return console.log(err);
			console.log(msg);
		});
	}

	// stats_data colunmns:
	// timestamp   bestAsk   bestBid   askEma   bidEma   askStd   bidStd
	processStatData() {
		this.lineReader.on("line", line => {
			let row = line.split("\t");
			if (row[0] == 'SELL' || row[0] == 'BUY' || row[0] == 'SOLD' || row[0] == 'BOUGHT') {
				this.tradeData.append(row[0], row[1], row[3]);
			} else {
				this.askData.append(row[0], row[1], row[3], row[5]);
				this.bidData.append(row[0], row[2], row[4], row[6]);
			}
		});
	}

	// raw_data colunmns:
	// timestamp   bestAsk   bestBid
	processRawData(wSize) {
		let n = 0;
		this.lineReader.on("line", line => {
			let row = line.split("\t");
			if (n > 15000) {
				this.lineReader.close();
			}
			if (row[0] == 'SELL' || row[0] == 'BUY' || row[0] == 'SOLD' || row[0] == 'BOUGHT') {
				// this.tradeData.append(row[0], row[1], row[3]);
			} else {
				n++;
				this.askData.appendRaw(row[0], row[1]);
				this.bidData.appendRaw(row[0], row[2]);
				if (n >= wSize) {
					let sellTradeArr = this.askData.calculateStats(row[0], n, wSize);
					let buyTradeArr = this.bidData.calculateStats(row[0], n, wSize);
					this.tradeData.appendSimulationData('SELL', sellTradeArr);
					this.tradeData.appendSimulationData('BUY', buyTradeArr);
				}
			}
		});
	}
}

class Data {
	constructor() {
		this.data = [];
		this.time = [];
		this.ema = [];
		this.std = [];
		this.floor = [];
		this.ceil = [];
		this.statTime = [];


		// used for plotting raw stats data
		this.prevEma = null;
	}

	appendRaw(time, data) {
		this.time.push(time);
		this.data.push(data);
	}

	calculateStats(time, pos, wSize) {
		this.statTime.push(time);
		// EMA
		if (this.prevEma == null) {
			this.prevEma = calcAvg(this.data.slice(0, wSize));
			this.ema.push(this.prevEma);
		} else {
			let ema = calcEma(this.data[pos-1], this.prevEma, wSize);
			this.ema.push(ema);
			this.prevEma = ema;
		}

		// Standard Deviation
		let std = calcStd(this.data.slice(pos-wSize, pos));
		let ceil = this.prevEma + std*BOLLINGER_BAND_FACTOR;
		let floor = this.prevEma - std*BOLLINGER_BAND_FACTOR
		this.std.push(std);
		this.ceil.push(ceil);
		this.floor.push(floor);

		return [time, this.data[pos-1], floor, ceil];
	}

	append(time, data, ema, std) {
		this.data.push(data);
		this.time.push(time);
		this.ema.push(ema);
		this.std.push(std);				
		this.floor.push(Number(ema) - BOLLINGER_BAND_FACTOR * Number(std));
		this.ceil.push(Number(ema) + BOLLINGER_BAND_FACTOR * Number(std));
		this.statTime.push(time);
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
			x: this.statTime,
			y: this.ema,
			name: name,
			type: "scatter"
		};
	}

	getFloorTrace(name) {
		return {
			x: this.statTime,
			y: this.floor,
			name: name,
			type: "scatter"
		};
	}

	getCeilTrace(name) {
		return {
			x: this.statTime,
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

	// simulationArr = [time, price, floor, ceil]
	appendSimulationData(orderType, simulationArr) {
		let time = simulationArr[0];
		let price = simulationArr[1];
		let floor = simulationArr[2];
		let ceil = simulationArr[3];

		// Trade Simulation
		let spread = ceil - floor;
		let p90 = floor + 0.9*spread;
		let p10 = floor + 0.1*spread;
		if (orderType == 'SELL' && price > p90) {
			this.sellData.push(price);
			this.sellTime.push(time);
		} else if (orderType == 'BUY' && price < p10) {
			this.buyData.push(price);
			this.buyTime.push(time);
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
// dp.processStatData();
dp.processRawData(300);

