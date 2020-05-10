#!/usr/bin/env node

"use strict";

const CONFIG = require("../../config.json");
const plotly = require("plotly")(CONFIG.PLOTLY_USERNAME, CONFIG.PLOTLY_API_KEY);
const fs = require("fs");
const {
    Position
} = require("../common/Constants.js");
const {
    TradeConfig,
    TradeSnapshot,
    TradeDecision,
} = require("../dto/Trade.js");
const Candle = require("../dto/Candle.js");

//timestamp,open,high,low,close,volume,close_time,quote_av,trades,tb_base_av,tb_quote_av,ignore

// Data describes one row of trade data.
class DataSimulator {
    constructor(filename) {
        this.filename = filename;
        this.data = [];
    }

    // startDate/endDate in YYYY-MM-DD format
    simulateTradeStrategy(tradeConfig, startDate, endDate = null, plot = false) {
        if (!endDate) {
            endDate = new Date(Date.now());
            endDate.setDate(endDate.getDate() + 1);
            endDate = endDate.toISOString().split('T')[0];
        }
        startDate = new Date(startDate);
        startDate = startDate.toISOString().split('T')[0];
        console.log(`Simulating trade strategy from ${startDate} to ${endDate}`);
        console.log(tradeConfig);

        this.processData(this.filename, startDate, endDate, () => {
            let result = this.runSimulation(tradeConfig);
            if (plot) {
                this.plot2YAxis("btc", result.plotData);
            }
            console.log(`Done simulation, net gain = ${result.netGain}`);
        });
    }

    // startDate/endDate in YYYY-MM-DD format
    trainModel(tradeConfig, startDate, endDate = null) {
        if (!endDate) {
            endDate = new Date(Date.now());
            endDate.setDate(endDate.getDate() + 1);
            endDate = endDate.toISOString().split('T')[0];
        }
        startDate = new Date(startDate);
        startDate = startDate.toISOString().split('T')[0];
        console.log(`Training model for dataset from ${startDate} to ${endDate}`);
        console.log(tradeConfig);

        let formatResult = (bb, s, wSize, vwSize, sT, result, max) => {
            console.log(`BB: ${bb}\ts: ${s}\twSize: ${wSize}\tvwSize: ${vwSize}\tsT: ${sT.toFixed(2)}\tn: ${result.trades}\tgain: ${result.netGain.toFixed(2)}\tmax: ${max.toFixed(2)}`)
        };

        this.processData(this.filename, startDate, endDate, () => {
            let writer = fs.createWriteStream(`model/${startDate}_${endDate}.csv`, {flags: "w"});
            writer.write("bb,s,wSize,v_wSize,stop_threshold,trades,netgain\n");
            let maxGain = 0;
            for (let i = 1; i <= tradeConfig.BBFactor; i += 0.5) {
                for (let j = 1; j <= tradeConfig.S; j += 0.5) {
                    for (let k = 15; k <= tradeConfig.WSize; k += 5) {
                        for (let l = 1; l <= k; l += 1) {
                            for (let m = 0; m < tradeConfig.StopThreshold; m += 0.05) {
                                let result = this.runSimulation(new TradeConfig(tradeConfig.Symbol, i, j, k, l, m));
                                if (result.netGain > 1000) {
                                    let row = [i, j, k, l, m, result.trades, result.netGain];
                                    writer.write(row.join(",") + "\n");
                                    formatResult(i, j, k, l, m, result, maxGain);
                                    if (result.netGain > maxGain) {
                                        maxGain = result.netGain;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            writer.end();
            console.log("Done training model, maxGain = ", maxGain);
        });
    }

    processData(filename, startDate, endDate, done = null) {
        let reader = require("readline").createInterface({input: fs.createReadStream(filename)});
        let found = false;
        reader.on("line", line => {
            if (line.startsWith(startDate)) {
                found = true;
            } else if (line.startsWith(endDate)) {
                found = false;
                reader.close();
                reader.removeAllListeners();
            }
            if (found) {
                this.data.push(line.split(","));
            }
        });
        reader.on("close", () => {
            if (done) {
                done();
            } else {

                ("done reading data, no callback found...");
            }
        });
    }

    plot2YAxis(title, plotData) {
        let layout = {
            title: title,
            xaxis2: {anchor: "y2"},
            yaxis2: {domain: [0, 0.333], side: "right"},
        };
        let options = {
            fileopt: "overwrite",
            filename: title,
            layout: layout,
        };
        this.plot(title, plotData, options)
    }

    plot(name, plotData, options = {fileopt: "overwrite", filename: name}) {
        plotly.plot(plotData, options, function (err, msg) {
            if (err) return console.log(err);
            console.log(msg);
        });
    }

    runSimulation(tradeConfig) {
        // Plot Data
        let timestamp = [], close = [];
        let buys = {x: [], y: []}, sells = {x: [], y: []};
        let floor = {x: [], y: []}, ceiling = {x: [], y: []};
        let vel = {x: [], y: []};
        let acc = {x: [], y: []};
        let pos = Position.BUY;

        // Define event handlers
        let decisionHandler = decision => {
            // console.log(`${decision.timestamp}\t${decision.pos}\t\t${decision.price}\n`);
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
        let snapshot = new TradeSnapshot(tradeConfig, this.data.slice(0, tradeConfig.WSize), false, velAccHandler);
        for (let i = tradeConfig.WSize; i < this.data.length; i++) {
            let candle = new Candle(this.data[i]);
            timestamp.push(candle.eventTime);
            close.push(Number(candle.close));
            snapshot.appendAndEvaluateTradeDecision(pos, candle, decisionHandler, velAccHandler);
            floor.x.push(candle.eventTime);
            floor.y.push(snapshot.floor);
            ceiling.x.push(candle.eventTime);
            ceiling.y.push(snapshot.ceiling);
        }

        // let ema = 0, v = 0, a = 0, runningSum = 0, window = new Array(tradeConfig.WSize);
        // let pos = "buy";
        // for (let i = 0; i < this.data.length; i++) {
        //     timestamp.push(this.data[i][0]);
        //     close.push(Number(this.data[i][4]));
        //     let price = close[i], t = timestamp[i];
        //     window[i % tradeConfig.WSize] = price;
        //     runningSum += price - (i < tradeConfig.WSize ? 0 : close[i - tradeConfig.WSize]);
        //     if (i < tradeConfig.WSize) {
        //         ema = price;
        //     } else {
        //         let ma = runningSum / tradeConfig.WSize;
        //         let s = tradeConfig.S / (1.0 + tradeConfig.WSize);
        //         ema = price * s + ema * (1 - s);
        //         let std = getStd(window, ma);
        //         floor.x.push(t);
        //         ceiling.x.push(t);
        //         floor.y.push(ema - tradeConfig.BBFactor * std);
        //         ceiling.y.push(ema + tradeConfig.BBFactor * std);
        //     }
        //
        //     // calculate vel/acc
        //     if (i % tradeConfig.VWSize === 0 && i !== 0) {
        //         v = price - close[i - tradeConfig.VWSize];
        //         a = v - vel.y[vel.y.length - 1];
        //         vel.x.push(t);
        //         vel.y.push(v);
        //         acc.x.push(timestamp[i - tradeConfig.VWSize], t);
        //         acc.y.push(a, a);
        //     }
        //
        //     // determine buy/sell
        //     if (pos === "buy" && price < floor.y.slice(-1)[0]) {
        //         // console.log("BUY t: " + timestamp[i] + " v: " + v.toFixed(2) + "\ta: " + a.toFixed(2));
        //         if (v < 0 && a > 0) {
        //             buys.x.push(t);
        //             buys.y.push(price);
        //             pos = "sell";
        //         }
        //     } else if (pos === "sell") {
        //         // console.log("SEL t: " + timestamp[i] + " v: " + v.toFixed(2) + "\ta: " + a.toFixed(2));
        //         let gain = price - buys.y.slice(-1)[0];
        //         let lossThreshold = 1 - (price / buys.y.slice(-1)[0]);
        //         if ((price > ceiling.y.slice(-1)[0] && v > 0 && a < 0 && gain >= 0) || lossThreshold >= tradeConfig.StopThreshold) {
        //             sells.x.push(t);
        //             sells.y.push(price);
        //             pos = "buy";
        //         }
        //     }
        // }
        if (pos === Position.SELL) {
            buys.x.pop();
            buys.y.pop();
        }
        return {
            netGain: getNetGain(buys.y, sells.y),
            trades: sells.y.length,
            plotData: [
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
        }
    }
}

function getStd(data, u) {
    let sum = 0.0;
    data.forEach(n => {
        sum += Math.pow(n - u, 2);
    });
    return Math.sqrt(sum / data.length);
}

function getNetGain(buys, sells) {
    let sum = 0.0;
    buys.forEach(n => {
        sum -= n;
    });
    sells.forEach(n => {
        sum += n;
    });
    // console.log("net gain = " + sum);
    return sum;
}

const modelConfig = new TradeConfig(
    "BTCUSDT",
    4,
    8,
    120,
    120,
    0.2
);
const tradeConfig = new TradeConfig(
    "BTCUSDT",
    2.5,
    1,
    85,
    12,
    0.05
);

const ds = new DataSimulator("data/BTCUSDT-1m-data.csv");

ds.trainModel(modelConfig, "2020-05-01");
// ds.trainModel(tradeConfig, "2020-05-01", "2020-05-02");
// ds.simulateTradeStrategy(tradeConfig, "2020-05-01", "2020-05-02", true);
// ds.simulateTradeStrategy(2, 1.5, 65, 15, "2020-05-01");