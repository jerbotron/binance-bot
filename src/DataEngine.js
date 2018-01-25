#!/usr/bin/env node

"use strict";

const CONFIG = require("../config.json");

var plotly = require("plotly")(CONFIG.PLOTLY_USERNAME, CONFIG.PLOTLY_API_KEY);
var lineReader = require("readline").createInterface({
	input: require("fs").createReadStream("./data/01_11_18/ADAETH.txt")
});

let data = [], time = [];

let smaData = [], emaData = [], maTime = [];
let prevSma = null, prevEma = null;

let stdDataCeil = [], stdDataFloor = [];

let n = 0, period = 300;	// in seconds

lineReader.on("line", line => {
	let arr = line.split("\t");

	// Create raw data set
	data.push(arr[0]);
	time.push(n);
	n++;

	// Create SMA and EMA data sets
	if (n >= period) {
		// SMA
		// if (prevSma == null) {
		// 	prevSma = calcAvg(data.slice(0, period));
		// } else {
		// 	prevSma = calcSma(parseFloat(data[n-period-1]), parseFloat(data[n-1]), prevSma, period);
		// }
		smaData.push(prevSma);
		// EMA
		if (prevEma == null) {
			prevEma = calcAvg(data.slice(0, period));
			emaData.push(prevEma);
		} else {
			let ema = calcEma(data[n-1], prevEma, period);
			emaData.push(ema);
			prevEma = ema;
		}
		// Standard Deviation
		let std = calcStd(data.slice(n-period, n));
		stdDataCeil.push(prevEma + std*1.5);
		stdDataFloor.push(prevEma - std*1.5);
		maTime.push(n);
	}
});

lineReader.on("close", () => {
	var dataTrace = {
		x: time,
		y: data,
		name: "Ticker Price",
		type: "scatter"
	};

	var smaTrace = {
		x: maTime,
		y: smaData,
		name: "SMA",
		type: "scatter"
	};

	var emaTrace = {
		x: maTime,
		y: emaData,
		name: "EMA",
		type: "scatter"
	};

	var stdTraceCeil = {
		x: maTime,
		y: stdDataCeil,
		name: "STD Ceil",
		type: "scatter"
	}

	var stdTraceFloor = {
		x: maTime,
		y: stdDataFloor,
		name: "STD Floor",
		type: "scatter"
	}

	var options = { fileopt: "overwrite", filename: "ema-plot" };
	var plotData = [dataTrace, emaTrace, stdTraceCeil, stdTraceFloor];

	plotly.plot(plotData, options, function(err, msg) {
		if (err) return console.log(err);
		console.log(msg);
	});
});

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
