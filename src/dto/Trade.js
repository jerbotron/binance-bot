#!/usr/bin/env node

"use strict";

const {
    Position
} = require('../common/Constants.js');

const SlidingWindow = require('./SlidingWindow.js');

class TradeConfig {
    constructor(
        symbol,
        bbFactor,
        smoothingConst,
        wSize,
        vWSize,
        stopLimit,
        position,
        isSimulation = true
    ) {
        this.symbol = symbol;
        this.bb = bbFactor;
        this.s = smoothingConst;
        this.wSize = wSize;
        this.vwSize = vWSize;
        this.stopLimit = stopLimit;
        this.position = position;
        this.isSimulation = isSimulation;
    }

    log() {
        console.log("TradeConfig: ");
        console.log(`* BB: ${this.symbol}\n* S: ${this.s}\n* wSize: ${this.wSize}\n* vwSize: ${this.vwSize}\n* sT: ${this.stopLimit.toFixed(2)}\n* position: ${this.position}\n* isSimulation: ${this.isSimulation}`);
    }
}

class TradeDecision {
    constructor(timestamp, pos, symbol, price) {
        this.timestamp = timestamp;
        this.pos = pos;
        this.symbol = symbol;
        this.price = price;
    }
}

/*
    TradeSnapshot holds the snapshot data for an interval of time and evaluates trade decisions as it appends new data.
    * snapshotData: initial window data used to initialize the snapshot
        * In LIVE mode, it's retrieved from https://github.com/binance-exchange/binance-official-api-docs/blob/master/rest-api.md#klinecandlestick-data
        * in TRAINING mode, it's in the format of src/analytics/data logs
 */
class TradeSnapshot {
    constructor(
        tradeConfig,
        snapshotData,
        liveMode = true,
        velAccHandler = () => {
        }
    ) {
        this.tradeConfig = tradeConfig;
        this.window = new SlidingWindow(tradeConfig.wSize);
        this.vel = 0;
        this.acc = 0;
        for (let i = 0; i < snapshotData.length; i++) {
            let close = Number(snapshotData[i][4]);
            this.ema = close;
            this.window.push(close);
            this.updateVelAndAcc(snapshotData[i][0], close, velAccHandler);
        }

        this.timestamp = liveMode ? new Date(snapshotData.slice(-1)[0][0]) : snapshotData.slice(-1)[0][0];
        this.prevBuy = null;
    }

    appendAndEvaluateTradeDecision(pos,
                                   candle,
                                   decisionHandler = () => {
                                   },
                                   velAccHandler = () => {
                                   }
    ) {
        let close = Number(candle.close);
        this.window.push(close);
        let s = this.tradeConfig.s / (1.0 + this.tradeConfig.wSize);
        this.ema = close * s + this.ema * (1 - s);
        let std = this.window.getStd();
        this.floor = this.ema - this.tradeConfig.bb * std;
        this.ceiling = this.ema + this.tradeConfig.bb * std;
        this.updateVelAndAcc(candle.eventTime, close, velAccHandler);
        if (candle.eventType === "kline") {
            this.timestamp = new Date(candle.eventTime);
        } else if (candle.eventType === "log") {
            this.timestamp = candle.eventTime;
        } else {
            console.log("Error: invalid candle format, " + candle.eventType);
        }

        decisionHandler(new TradeDecision(this.timestamp, Position.BUY, this.tradeConfig.symbol, close));

        // evaluate trade decision
        // if (pos === Position.BUY && close < this.floor && this.vel < 0 && this.acc > 0) {
        //     this.prevBuy = close;
        //     decisionHandler(new TradeDecision(this.timestamp, Position.BUY, this.tradeConfig.symbol, close));
        // } else if (pos === Position.SELL && this.prevBuy) {
        //     let gain = close - this.prevBuy;
        //     let lossThreshold = 1 - (close / this.prevBuy);
        //     if ((close > this.ceiling && this.vel > 0 && this.acc < 0 && gain >= 0) ||
        //         lossThreshold >= this.tradeConfig.stopLimit) {
        //         decisionHandler(new TradeDecision(this.timestamp, Position.SELL, this.tradeConfig.symbol, close));
        //     }
        // }
    }

    updateVelAndAcc(timestamp,
                    price,
                    handler = () => {
                    }
    ) {
        if (this.window.isAtMultipleOf(this.tradeConfig.vwSize)) {
            let prevVel = this.vel;
            this.vel = price - this.window.lastN(this.tradeConfig.vwSize);
            this.acc = this.vel - prevVel;
            handler(timestamp, this.vel, this.acc);
        }
    }
}

module.exports = {
    TradeConfig,
    TradeSnapshot,
    TradeDecision
};