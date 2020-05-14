#!/usr/bin/env node

"use strict";

const path = require("path");
const CONFIG = require("../../config.json");
const plotly = require("plotly")(CONFIG.PLOTLY_USERNAME, CONFIG.PLOTLY_API_KEY);
const fs = require("fs");
const {
    Position
} = require("../common/Constants.js");
const {
    TradeConfig,
} = require("../dto/Trade.js");
const {
    runSimulation
} = require("./Worker");
const Pool = require('worker-threads-pool');

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

        this.processData(this.filename, startDate, endDate).then(() => {
            let result = runSimulation(this.data, tradeConfig);
            let writer = fs.createWriteStream(`simulation/${startDate}_${endDate}.csv`, {flags: "w"});
            writer.write("timestamp,order,price,gain\n");
            for (let i = 0; i < result.buys.x.length; i++) {
                let buy = Number(result.buys.y[i]);
                let sell = Number(result.sells.y[i]);
                writer.write([result.buys.x[i], Position.BUY, result.buys.y[i]].join(',') + "\n");
                writer.write([result.sells.x[i], Position.SELL, result.sells.y[i], sell - buy].join(',') + "\n");
            }
            if (plot) {
                this.plot2YAxis("btc", result.plotData);
            }
            writer.end();
            console.log(`Done simulation, trades = ${result.sells.y.length}, net gain = ${result.netGain}`);
        });
    }

    // startDate/endDate in YYYY-MM-DD format
    trainModel(modelConfig, startDate, endDate = null, poolSize = 2) {
        if (!endDate) {
            endDate = new Date(Date.now());
            endDate.setDate(endDate.getDate() + 1);
            endDate = endDate.toISOString().split('T')[0];
        }
        startDate = new Date(startDate);
        startDate = startDate.toISOString().split('T')[0];
        console.log(`Training model for dataset from ${startDate} to ${endDate}`);
        console.log(modelConfig);

        let startTime = new Date();
        let writer = fs.createWriteStream(`model/${startDate}_${endDate}.csv`, {flags: "w"});
        writer.write("bb,s,wSize,v_wSize,stop_threshold,trades,netgain\n");

        this.processData(this.filename, startDate, endDate).then(async () => {
                // let logResults = (msg) => {
                //     console.log(`BB: ${msg[0]}\ts: ${msg[1]}\twSize: ${msg[2]}\tvwSize: ${msg[3]}\tsT: ${msg[4]}\tn: ${msg[5]}\tgain: ${msg[6]}\t`)
                // };
                let work = [];
                for (let bb = 1; bb <= modelConfig.bb; bb += 0.5) {
                    for (let s = 1; s <= modelConfig.s; s += 0.5) {
                        for (let wSize = 15; wSize <= modelConfig.wSize; wSize += 5) {
                            for (let vSize = 1; vSize <= wSize / 2; vSize += 1) {
                                for (let stop = 0; stop <= modelConfig.stopLimit; stop += 0.01) {
                                    work.push(new TradeConfig(modelConfig.symbol, bb, s, wSize, vSize, stop));
                                }
                            }
                        }
                    }
                }

                console.log(`Beginning model simulations on [${work.length}] configs.`);

                await this.distributeModelWorkers(work, writer, poolSize);

                writer.end();
                console.log(`Done training model in ${(Date.now() - startTime.getTime()) / 1000}s`);
            }
        )
    }

    async distributeModelWorkers(work, writer, poolSize) {
        let maxGain = 0;
        const workerPool = new Pool({max: poolSize});
        const promises = new Array(work.length)
            .fill()
            .map((_, i) => {
                return new Promise((resolve, reject) => {
                    workerPool.acquire('./Worker.js', {workerData: {data: this.data, config: work[i]}},
                        (err, worker) => {
                            if (err) throw err;
                            worker.once('message', (result) => {
                                if (result.netGain > 1000) {
                                    let msg = [result.config.bb, result.config.s, result.config.wSize, result.config.vwSize,
                                        result.config.stopLimit.toFixed(2), result.sells.y.length, result.netGain];
                                    writer.write(msg.join(',') + "\n");
                                    if (result.netGain > maxGain) {
                                        maxGain = result.netGain;
                                        console.log(msg.join(',\t'));
                                    }
                                }
                                resolve();
                            });
                            worker.once('error', err => {
                                console.log(`error occurred in worker: ${err}`);
                                reject();
                            });
                        });
                });
            });

        await Promise.all(promises);
    }

    processData(filename, startDate, endDate) {
        return new Promise((resolve => {
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
                resolve();
            });
        }));
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
}

const ds = new DataSimulator("data/BTCUSDT-1m-data.csv");
const modelConfig = new TradeConfig(
    "BTCUSDT", 3, 3, 120, 120, 0.02);

// ds.trainModel(modelConfig, "2020-04-01", "2020-05-01");
// ds.trainModel(modelConfig, "2020-05-01", "2020-05-02");

const tradeConfig = new TradeConfig(
    "BTCUSDT", 1, 2.5, 35, 11, 0.02);

ds.simulateTradeStrategy(tradeConfig, "2020-05-13", null, true);
// ds.simulateTradeStrategy(2, 1.5, 65, 15, "2020-05-01");