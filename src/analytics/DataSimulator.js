#!/usr/bin/env node

"use strict";

const CONFIG = require("../../config.json");
const plotly = require("plotly")(CONFIG.PLOTLY_USERNAME, CONFIG.PLOTLY_API_KEY);
const fs = require("fs");
const {
    GetHistoricalKlines
} = require('../http/Client');
const {
    Position,
    Minute
} = require("../common/Constants");
const {
    TradeConfig,
} = require("../dto/Trade");
const {
    runSimulation
} = require("./Worker");
const Pool = require('worker-threads-pool');

//timestamp,open,high,low,close,volume,close_time,quote_av,trades,tb_base_av,tb_quote_av,ignore

// Data describes one row of trade data.
class DataSimulator {
    constructor(filename) {
        this.filename = filename;
        this.symbol = "BTCUSDT";
        this.data = [];
    }

    async backfillData() {
        await new Promise((resolve => {
            if (!fs.existsSync(this.filename)) {
                console.log("Back filling data from the beginning of Binance, this will take awhile...");
                resolve(Date.parse("2017-01-01"));
            } else {
                fs.readFile(this.filename, 'utf-8', (err, data) => {
                    if (err) throw err;
                    let lastLine = data.trim().split('\n').slice(-1)[0];
                    resolve(Date.parse(lastLine.split(',')[0]) + Minute);
                });
            }
        })).then(async startTimeMs => {
            let curTimeMs = Date.now();
            if (curTimeMs - startTimeMs > Minute) {
                let delta = Math.floor((curTimeMs - startTimeMs) / Minute);
                let pages = Math.ceil(delta / 1000); // 1000 is the pageSize limit for /api/v3/klines API.
                console.log(`Back filling ${delta} minutes (${pages} pages) of new data...`);
                let writer = fs.createWriteStream(this.filename, {flags: 'a'});
                for (let i = 0; i < pages; i++) {
                    await new Promise((resolve => {
                        GetHistoricalKlines(this.symbol, startTimeMs, curTimeMs).then(res => {
                            let endTime = res[res.length - 1][0];
                            res.forEach(kline => {
                                kline[0] = (new Date(kline[0])).toISOString(); // open time
                                kline[6] = (new Date(kline[6])).toISOString(); // close time
                                kline.push('\n');
                                writer.write(kline.join(','));
                            });
                            resolve(endTime);
                        });
                    })).then(prevTime => {
                        startTimeMs = prevTime + Minute // next page
                    });
                }
                writer.end();
            }
        }).catch(err => {
            throw err
        });
        return new Promise(resolve => resolve());
    }

    // startDate/endDate in YYYY-MM-DD format
    simulateTradeStrategy(tradeConfig, startDate, endDate = null, plot = false, record = false) {
        if (!endDate) {
            endDate = new Date(Date.now());
            endDate.setDate(endDate.getDate() + 1);
            endDate = endDate.toISOString().split('T')[0];
        }
        startDate = new Date(startDate);
        startDate = startDate.toISOString().split('T')[0];

        this.processData(this.filename, startDate, endDate).then(() => {
            console.log(`Simulating trade strategy from ${startDate} to ${endDate}`);
            let result = runSimulation(this.data, tradeConfig);
            let writer;
            if (record) {
                writer = fs.createWriteStream(`simulation/${startDate}_${endDate}.csv`, {flags: "w"});
                writer.write("timestamp,order,price,gain\n");
            }
            for (let i = 0; i < result.buys.x.length; i++) {
                let buy = Number(result.buys.y[i]);
                let sell = Number(result.sells.y[i]);
                if (writer) {
                    writer.write([result.buys.x[i], Position.BUY, result.buys.y[i]].join(',') + "\n");
                    writer.write([result.sells.x[i], Position.SELL, result.sells.y[i], sell - buy].join(',') + "\n");
                }
            }
            if (plot) {
                this.plot2YAxis("btc", result.plotData);
            }
            if (writer) {
                writer.end();
            }
            console.log(`Done simulation, trades = ${result.sells.y.length}, net gain = ${result.netGain}`);
        });
    }

    // startDate/endDate in YYYY-MM-DD format
    trainModel(modelConfig, startDate, endDate = null, poolSize = 3) {
        if (!endDate) {
            endDate = new Date(Date.now());
            endDate.setDate(endDate.getDate() + 1);
            endDate = endDate.toISOString().split('T')[0];
        }
        startDate = new Date(startDate);
        startDate = startDate.toISOString().split('T')[0];
        console.log(`Training model for dataset from ${startDate} to ${endDate}`);
        console.log(modelConfig);

        this.processData(this.filename, startDate, endDate).then(async () => {
                let startTime = new Date();
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

                const results = await this.distributeModelWorkers(work, poolSize);

                let writer = fs.createWriteStream(`model/${startDate}_${endDate}.csv`, {flags: "w"});
                writer.write("bb,s,wSize,v_wSize,stop_threshold,trades,netgain\n");
                results.forEach(res => {
                    res.forEach(line => {
                        line.push('\n');
                        writer.write(line.join(','));
                    })
                });
                writer.end();
                console.log(`Done training model in ${(Date.now() - startTime.getTime()) / 1000}s`);
            }
        )
    }

    async distributeModelWorkers(work, poolSize) {
        const workerPool = new Pool({max: poolSize});
        const workUnitsPerWorker = Math.ceil(work.length / poolSize);
        const promises = new Array(poolSize);
        let maxGain = 0;
        for (let i = 0; i < poolSize; i++) {
            promises[i] = new Promise(((resolve, reject) => {
                workerPool.acquire('./Worker.js', {
                        workerData: {
                            data: this.data,
                            configs: work.slice(i * workUnitsPerWorker, (i + 1) * workUnitsPerWorker)
                        }
                    },
                    (err, worker) => {
                        worker.on('message', (msg) => {
                            if (msg.workerOutput) {
                                resolve(msg.workerOutput);
                            } else if (msg.output) {
                                let netGain = msg.output[msg.output.length - 1];
                                if (netGain > maxGain) {
                                    console.log(msg.output.join('\t'));
                                    maxGain = netGain;
                                }
                            }
                        });
                        worker.once('error', err => {
                            console.log(`error occurred in worker: ${err}`);
                            reject();
                        })
                    })
            }));
        }

        return Promise.all(promises);
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

const ds = new DataSimulator("data/BTCUSDT-1m.csv");

ds.backfillData().then(() => {
    const modelConfig = new TradeConfig(
        "BTCUSDT", 3, 8, 120, 120, 0.02, Position.BUY);

    const tradeConfig = new TradeConfig(
        "BTCUSDT", 2, 2, 100, 19, 0, Position.BUY);

    // ds.trainModel(modelConfig, "2020-05-01", "2020-05-02");
    ds.simulateTradeStrategy(tradeConfig, "2020-05-01", "2020-05-02", true, false);
    // ds.simulateTradeStrategy(tradeConfig, "2020-01-01", "2020-02-01", false, false);
    // ds.simulateTradeStrategy(tradeConfig, "2020-02-01", "2020-03-01", false, false);
    // ds.simulateTradeStrategy(tradeConfig, "2020-03-01", "2020-04-01", false, false);
    // ds.simulateTradeStrategy(tradeConfig, "2020-04-01", "2020-05-01", false, false);
    // ds.simulateTradeStrategy(tradeConfig, "2020-05-01", null, false, false);
}).catch(e => {
    console.log("error backfilling kline data, " + e);
});