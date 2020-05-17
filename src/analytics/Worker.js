#!/usr/bin/env node

"use strict";

const {isMainThread, parentPort, workerData} = require('worker_threads');
const {
    Position
} = require("../common/Constants.js");
const {
    TradeSnapshot,
} = require("../dto/Trade");
const {
    Candle,
} = require("../dto/Candle");

function runSimulation(data, tradeConfig) {
    // Create plot data
    let timestamp = [], close = [];
    let buys = {x: [], y: []}, sells = {x: [], y: []};
    let floor = {x: [], y: []}, ceiling = {x: [], y: []};
    let vel = {x: [], y: []};
    let acc = {x: [], y: []};
    let pos = tradeConfig.position;

    // Define event handlers
    let decisionHandler = (decision) => {
        if (decision.pos === Position.BUY) {
            buys.x.push(decision.timestamp);
            buys.y.push(decision.price);
            pos = Position.SELL;
        } else if (decision.pos === Position.SELL) {
            sells.x.push(decision.timestamp);
            sells.y.push(decision.price);
            pos = Position.BUY;
        }
    };
    let velAccHandler = (t, v, a) => {
        vel.x.push(t);
        vel.y.push(v);
        if (acc.x.length > 0) {
            acc.x.push(acc.x[acc.x.length - 1]);
            acc.y.push(a);
        }
        acc.x.push(t);
        acc.y.push(a);
    };

    // Create trade snapshot and begin simulation
    let snapshot = new TradeSnapshot(tradeConfig, data.slice(0, tradeConfig.wSize), false, velAccHandler);
    for (let i = tradeConfig.wSize; i < data.length; i++) {
        let candle = new Candle(data[i]);
        timestamp.push(candle.eventTime);
        close.push(Number(candle.close));
        snapshot.updateAndEvaluateTradeDecision(pos, candle, decisionHandler, velAccHandler);
        floor.x.push(candle.eventTime);
        floor.y.push(snapshot.floor);
        ceiling.x.push(candle.eventTime);
        ceiling.y.push(snapshot.ceiling);
    }

    if (buys.x.length > sells.x.length) {
        buys.x.pop();
        buys.y.pop();
    } else if (sells.x.length > buys.x.length) {
        sells.x.shift();
        sells.y.shift();
    }
    let netGain = (buys, sells) => {
        let sum = 0.0;
        buys.forEach(n => {
            sum -= n;
        });
        sells.forEach(n => {
            sum += n;
        });
        return sum;
    };
    return {
        config: tradeConfig,
        buys: buys,
        sells: sells,
        netGain: netGain(buys.y, sells.y),
        plotData:
            [
                {
                    x: timestamp,
                    y: close,
                    name: "close",
                    type: "scatter"
                },
                {
                    x: floor.x,
                    y: floor.y,
                    name: "floor",
                    type: "scatter"
                },
                {
                    x: ceiling.x,
                    y: ceiling.y,
                    name: "ceiling",
                    type: "scatter"
                },
                {
                    x: buys.x,
                    y: buys.y,
                    name: "buys",
                    type: "scatter",
                    mode: "markers",
                    marker: {
                        size: 8,
                        line: {
                            color: "white",
                            width: 0.5
                        }
                    },
                },
                {
                    x: sells.x,
                    y: sells.y,
                    name: "sells",
                    type: "scatter",
                    mode: "markers",
                    marker: {
                        size: 8,
                        line: {
                            color: "white",
                            width: 0.5
                        }
                    },
                },
                {
                    x: vel.x,
                    y: vel.y,
                    name: "vel",
                    type: "scatter",
                    yaxis: "y2",
                },
                {
                    x: acc.x,
                    y: acc.y,
                    name: "acc",
                    type: "scatter",
                    yaxis: "y2",
                },
                {
                    x: buys.x,
                    y: new Array(buys.x.length).fill(0),
                    yaxis: "y2",
                    name: "b",
                    type: "scatter",
                    mode: "markers",
                    marker: {
                        size: 8,
                        line: {
                            color: "white",
                            width: 0.5
                        }
                    },
                },
                {
                    x: sells.x,
                    y: new Array(sells.x.length).fill(0),
                    yaxis: "y2",
                    name: "s",
                    type: "scatter",
                    mode: "markers",
                    marker: {
                        size: 8,
                        line: {
                            color: "white",
                            width: 0.5
                        }
                    },
                }
            ]
    };
}

if (!isMainThread) {
    const {data, config} = workerData;
    let result = runSimulation(data, config);
    parentPort.postMessage(result);
}

module.exports = {runSimulation};