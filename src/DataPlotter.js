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
		this.lineReader = null;
	}

	setReader(filename) {
		this.lineReader = require("readline").createInterface({
			input: require("fs").createReadStream(filename)
		});
	}

	plot(name, plotData) {
		var options = { fileopt: "overwrite", filename: name };
		plotly.plot(plotData, options, function(err, msg) {
			if (err) return console.log(err);
			console.log(msg);
		});
	}

	// stats_data colunmns:
	// timestamp   bestAsk   bestBid   askEma   bidEma   askStd   bidStd
	processTickerData(filename, title) {
		let askData = new TickerData();
		let bidData = new TickerData();
		let buySellData = new BuySellData();
		this.setReader(filename);
		this.lineReader.on("line", line => {
			let row = line.split("\t");
			if (row[0] == 'SELL' || row[0] == 'BUY' || row[0] == 'SOLD' || row[0] == 'BOUGHT') {
				buySellData.append(row[0], row[1], row[3]);
			} else {
				askData.append(row[0], row[1], row[3], row[5]);
				bidData.append(row[0], row[2], row[4], row[6]);
			}
		});
		let plotData = [
			askData.getDataTrace("Ask Ticker"),
			askData.getEmaTrace("Ask EMA"),
			askData.getFloorTrace("Ask Floor"),
			askData.getCeilTrace("Ask Ceil"),
			bidData.getDataTrace("Bid Ticker"), 
			bidData.getEmaTrace("Bid EMA"),
			bidData.getFloorTrace("Bid Floor"),
			bidData.getCeilTrace("Bid Ceil"),
			buySellData.getSellTrace(),
			buySellData.getSoldTrace(),
			buySellData.getBuyTrace(),
			buySellData.getBoughtTrace()
		];
		this.lineReader.on("close", () => {
			this.plot(title, plotData);
		});
	}

	// stats_data colunmns:
	// timestamp   price   qty   ma   std
	processTradeData(filename, title) {
		let tradeData = new TradeData();
		let buySellData = new BuySellData();
		this.setReader(filename);
		this.lineReader.on("line", line => {
			let row = line.split("\t");
			if (row[0] == 'SELL' || row[0] == 'BUY' || row[0] == 'SOLD' || row[0] == 'BOUGHT') {
				buySellData.append(row[0], row[1], row[3]);
			} else {
				tradeData.append(row[0], row[1], row[3], row[4]);
			}
		});
		let plotData = [
			tradeData.getDataTrace("Price"),
			tradeData.getMaTrace("MA"),
			tradeData.getFloorTrace("Floor"),
			tradeData.getCeilTrace("Ceil")
		];
		this.lineReader.on("close", () => {
			this.plot(title, plotData);
		});
	}

	// raw_data colunmns:
	// timestamp   bestAsk   bestBid
	processRawTickerData(filename, title, wSize) {
		let askData = new TickerData();
		let bidData = new TickerData();
		let buySellData = new BuySellData();
		let n = 0;
		this.setReader(filename);
		this.lineReader.on("line", line => {
			let row = line.split("\t");
			n++;
			askData.appendRaw(row[0], row[1]);
			bidData.appendRaw(row[0], row[2]);
			if (n >= wSize) {
				let sellTradeArr = this.askData.calculateStats(row[0], n, wSize);
				let buyTradeArr = this.bidData.calculateStats(row[0], n, wSize);
				buySellData.appendSimulationData('SELL', sellTradeArr);
				buySellData.appendSimulationData('BUY', buyTradeArr);
			}
		});
		let plotData = [
			askData.getDataTrace("Ask Ticker"),
			askData.getEmaTrace("Ask EMA"),
			askData.getFloorTrace("Ask Floor"),
			askData.getCeilTrace("Ask Ceil"),
			bidData.getDataTrace("Bid Ticker"), 
			bidData.getEmaTrace("Bid EMA"),
			bidData.getFloorTrace("Bid Floor"),
			bidData.getCeilTrace("Bid Ceil"),
			buySellData.getSellTrace(),
			buySellData.getSoldTrace(),
			buySellData.getBuyTrace(),
			buySellData.getBoughtTrace()
		];
		this.lineReader.on("close", () => {
			this.plot(title, plotData);
		});
	}

	// raw_data colunmns:
	// timestamp   price   qty
	processRawTradeData(filename, title, wSize) {
		let tradeData = new TradeData();
		let startTimestamp = null;
		this.setReader(filename);
		this.lineReader.on("line", line => {
			let row = line.split("\t");
			let timestamp = parseInt(row[0]);
			if (startTimestamp == null) {
				startTimestamp = timestamp;
			}
			tradeData.appendRaw(timestamp, row[1]);
			if (timestamp - startTimestamp >= wSize) {
				tradeData.calculateTradeStats(timestamp, wSize);
				startTimestamp = timestamp - wSize;
			}
		});
		let plotData = [
			tradeData.getDataTrace("Price"),
			tradeData.getMaTrace("MA"),
			tradeData.getFloorTrace("Floor"),
			tradeData.getCeilTrace("Ceil")
		];
		this.lineReader.on("close", () => {
			this.plot(title, plotData);
		});
	}
}

class TickerData {
	constructor() {
		this.data = [];
		this.time = [];
		this.ma = [];
		this.std = [];
		this.floor = [];
		this.ceil = [];
		this.statTime = [];

		// used for plotting raw stats data
		this.prevMa = null;
	}

	appendRaw(time, data) {
		this.time.push(time);
		this.data.push(data);
	}

	calculateStats(time, pos, wSize) {
		this.statTime.push(time);

		// EMA
		// if (this.prevMa == null) {
		// 	this.prevMa = calcAvg(this.data.slice(0, wSize));
		// 	this.ma.push(this.prevMa);
		// } else {
		// 	let ema = calcEma(this.data[pos-1], this.prevMa, wSize);
		// 	this.ma.push(ema);
		// 	this.prevMa = ema;
		// }

		// SMA
		this.prevMa = calcAvg(this.data.slice(pos-wSize, pos)); 
		this.ma.push(this.prevMa);

		// Standard Deviation
		let std = calcStd(this.data.slice(pos-wSize, pos));
		let ceil = this.prevMa + std*BOLLINGER_BAND_FACTOR;
		let floor = this.prevMa - std*BOLLINGER_BAND_FACTOR
		this.std.push(std);
		this.ceil.push(ceil);
		this.floor.push(floor);

		return [time, this.data[pos-1], floor, ceil];
	}

	append(time, data, ema, std) {
		this.data.push(data);
		this.time.push(time);
		this.ma.push(ema);
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
			y: this.ma,
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
		this.dataMap = new Map();
		this.data = [];
		this.time = [];
		this.ma = [];
		this.std = [];
		this.floor = [];
		this.ceil = [];
		this.statTime = [];
	}

	append(timestamp, price, ma, std) {
		this.time.push(timestamp);
		this.statTime.push(timestamp);
		this.data.push(price);
		this.ma.push(ma);
		this.std.push(std);
		this.floor.push(Number(ma) - BOLLINGER_BAND_FACTOR * Number(std));
		this.ceil.push(Number(ma) + BOLLINGER_BAND_FACTOR * Number(std));
	}

	appendRaw(timestamp, price) {
		this.time.push(timestamp);
		this.data.push(price);
		if (!this.dataMap.has(timestamp)) {
			this.dataMap.set(timestamp, new TradeSum());
		}
		this.dataMap.get(timestamp).addTrade(price, 1);
	}

	calculateTradeStats(timestamp, wSize) {
		this.statTime.push(timestamp);
		let sum = 0, vSum = 0, size = 0;
		for (let i = timestamp; i > timestamp - wSize; i--) {
			if (this.dataMap.has(i)) {
				sum += this.dataMap.get(i).sum;
				size += this.dataMap.get(i).qty;
			}
		}
		let u = sum/size;
		this.ma.push(u);
		for (let i = timestamp; i > timestamp - wSize; i--) {
			if (this.dataMap.has(i)) {
				vSum += this.dataMap.get(i).getSquaredSum(u);
			}
		}
		let std = Math.sqrt(vSum/size);
		this.std.push(std);
		this.floor.push(u - BOLLINGER_BAND_FACTOR*std);
		this.ceil.push(u + BOLLINGER_BAND_FACTOR*std);
	}

	getDataTrace(name) {
		return {
			x: this.time,
			y: this.data,
			name: name,
			type: "scatter"
		};
	}

	getMaTrace(name) {
		return {
			x: this.statTime,
			y: this.ma,
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

class BuySellData {

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

class TradeSum {
	constructor() {
		this._sum = 0;
		this._qty = 0;
		this.prices = [];
		this.sizes = [];
	}

	get sum() {
		return this._sum;
	}

	get qty() {
		return this._qty;
	}

	addTrade(price, qty) {
		this._sum += (Number(price) * Number(qty));
		this._qty += Number(qty);
		this.prices.push(Number(price));
		this.sizes.push(Number(qty));
	}

	getSquaredSum(u) {
		let sum = 0;
		for (let i = 0; i < this.prices.length; i++) {
			sum += (Math.pow((this.prices[i] - u), 2) * this.sizes[i]);
		}
		return sum;
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
		total += Number(n);
	});
	return total/data.length;
}

function calcStd(data) {
	let u = calcAvg(data);
	let sum = 0;
	data.forEach(n => {
		sum += Math.pow(Number(n)-u, 2);
	});
	return Math.sqrt(sum/data.length);
}

const dp = new DataPlotter();
// dp.processTickerData('./logs/2018-02-12/BNBUSDT_stats.txt', 'BNBUSDT - ticker');
// dp.processRawTradeData('./logs/2018-02-19/ETHUSDT_trade_stats.txt', 'ETHUSDT - trade raw', 1200);
dp.processTradeData('./logs/2018-02-25/ETHUSDT_trade_stats.txt', 'ETHUSDT - trade');

