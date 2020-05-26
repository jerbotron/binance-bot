#!/usr/bin/env node

"use strict";

const {isMainThread, parentPort, workerData} = require('worker_threads');
const {
    Position
} = require("../common/Constants");
const {
    TradeSnapshot,
} = require("../dto/Trade");
const {
    Candle,
} = require("../dto/Candle");
const PlotData = require("./PlotData");

// Returns: 1 = +cross, -1 = -cross, 0 = no cross
function emaCrossed(ema, close) {
    if (ema.length === 2 && close.length === 2) {
        if (close[0] < ema[0] && close[1] > ema[1]) {
            return 1;
        } else if (close[0] > ema[0] && close[1] < ema[1]) {
            return -1;
        }
    }
    return 0;
}

function runSimulation(data, tradeConfig) {
    // Create plot data
    let close = new PlotData("close"), ema = new PlotData("ema");
    let buys = new PlotData("buys"), sells = new PlotData("sells");
    let floor = new PlotData("floor"), ceiling = new PlotData("ceiling");
    let emaCrossUp = new PlotData("cross_up"), emaCrossDown = new PlotData("cross_down");
    let vel = new PlotData("vel"), acc = new PlotData("acc");
    let velMarkers = new PlotData("vel_markers");
    let pos = tradeConfig.position;

    // Define event handlers
    let decisionHandler = (decision) => {
        if (decision.pos === Position.BUY) {
            buys.push(decision.timestamp, decision.price);
            pos = Position.SELL;
        } else if (decision.pos === Position.SELL) {
            sells.push(decision.timestamp, decision.price);
            pos = Position.BUY;
        }
    };
    let velAccHandler = (t, v, a) => {
        vel.push(t, v);
        if (vel.x.length % tradeConfig.vwSize === 0) {
            velMarkers.push(t, v);
        }
        if (acc.x.length > 0) {
            acc.push(acc.x[acc.x.length - 1], a);
        }
        acc.push(t, a);
    };

    // Create trade snapshot and begin simulation
    let snapshot = new TradeSnapshot(tradeConfig, data.slice(0, tradeConfig.wSize), false, velAccHandler);
    for (let i = 0; i < data.length; i++) {
        let candle = new Candle(data[i]);
        close.push(candle.eventTime, Number(candle.close));
        if (i < tradeConfig.wSize) {
            continue;
        }
        snapshot.updateAndEvaluateTradeDecision(pos, candle, decisionHandler, velAccHandler);
        ema.push(candle.eventTime, snapshot.ema);
        switch (emaCrossed(ema.y.slice(-2), close.y.slice(-2))) {
            case 1:
                emaCrossUp.push(candle.eventTime, snapshot.ema);
                break;
            case -1:
                emaCrossDown.push(candle.eventTime, snapshot.ema);
                break;
        }
        floor.push(candle.eventTime, snapshot.floor);
        ceiling.push(candle.eventTime, snapshot.ceiling);
    }

    if (buys.x.length > sells.x.length) {
        buys.pop();
    } else if (sells.x.length > buys.x.length) {
        sells.shift();
    }
    return {
        config: tradeConfig,
        buys: buys,
        sells: sells,
        netGain: sells.sum() - buys.sum(),
        plotData:
            [
                close.getPlotData(),
                floor.getPlotData(),
                ceiling.getPlotData(),
                ema.getPlotData(),
                // emaCrossUp.getPlotData({mode: "markers"}),
                // emaCrossDown.getPlotData({mode: "markers"}),
                buys.getPlotData({
                    mode: "markers",
                    marker: {
                        size: 8,
                        line: {
                            color: "white",
                            width: 0.5
                        }
                    }
                }),
                sells.getPlotData({
                    mode: "markers",
                    marker: {
                        size: 8,
                        line: {
                            color: "white",
                            width: 0.5
                        }
                    }
                }),
                velMarkers.getPlotData({
                    y: new Array(velMarkers.y.length).fill(0),
                    yaxis: "y2",
                    mode: "markers"
                }),
                vel.getPlotData({yaxis: "y2"}),
                acc.getPlotData({yaxis: "y2"}),
                buys.getPlotData({
                    y: new Array(buys.y.length).fill(0),
                    name: "b",
                    yaxis: "y2",
                    mode: "markers",
                    marker: {
                        size: 8,
                        line: {
                            color: "white",
                            width: 0.5
                        }
                    }
                }),
                sells.getPlotData({
                    y: new Array(sells.y.length).fill(0),
                    name: "s",
                    yaxis: "y2",
                    mode: "markers",
                    marker: {
                        size: 8,
                        line: {
                            color: "white",
                            width: 0.5
                        }
                    },
                })
            ]
    };
}

function toTradeConfigArray(config) {
    return [config.bb, config.s, config.wSize, config.vwSize, config.stopLimit.toFixed(2)];
}

if (!isMainThread) {
    const {data, configs} = workerData;
    let maxGain = 0;
    let workerOutput = [];
    configs.forEach(config => {
        let result = runSimulation(data, config);
        if (result.netGain > 100) {
            let output = toTradeConfigArray(config);
            output.push(result.sells.y.length, result.netGain.toFixed(2));
            if (result.netGain > maxGain) {
                parentPort.postMessage({output: output});
            }
            workerOutput.push(output);
        }
    });
    parentPort.postMessage({workerOutput: workerOutput});
}

module.exports = {runSimulation};