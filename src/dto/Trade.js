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
        bbWSize,
        vWSize,
        stopThreshold,
        position = Position.BUY,
        isSimulation = true
    ) {
        this.Symbol = symbol;
        this.BBFactor = bbFactor;
        this.S = smoothingConst;
        this.WSize = bbWSize;
        this.VWSize = vWSize;
        this.StopThreshold = stopThreshold;
    }
}

class TradeDecision {
    constructor(timestamp, pos, price) {
        this.timestamp = timestamp;
        this.pos = pos;
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
        this.window = new SlidingWindow(tradeConfig.WSize);
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
        let s = this.tradeConfig.S / (1.0 + this.tradeConfig.WSize);
        this.ema = close * s + this.ema * (1 - s);
        let std = this.window.getStd();
        this.floor = this.ema - this.tradeConfig.BBFactor * std;
        this.ceiling = this.ema + this.tradeConfig.BBFactor * std;
        this.updateVelAndAcc(candle.eventTime, close, velAccHandler);
        if (candle.eventType === "kline") {
            this.timestamp = new Date(candle.eventTime);
        } else if (candle.eventType === "log") {
            this.timestamp = candle.eventTime;
        } else {
            console.log("Error: invalid candle format, " + candle);
        }

        // evaluate trade decision
        if (pos === Position.BUY && close < this.floor && this.vel < 0 && this.acc > 0) {
            this.prevBuy = close;
            decisionHandler(new TradeDecision(this.timestamp, Position.BUY, close));
        } else if (pos === Position.SELL && this.prevBuy) {
            let gain = close - this.prevBuy;
            let lossThreshold = 1 - (close / this.prevBuy);
            if ((close > this.ceiling && this.vel > 0 && this.acc < 0 && gain >= 0) ||
                lossThreshold >= this.tradeConfig.StopThreshold) {
                decisionHandler(new TradeDecision(this.timestamp, Position.SELL, close));
            }
        }
    }

    updateVelAndAcc(timestamp,
                    price,
                    handler = () => {
                    }
    ) {
        if (this.window.isAtMultipleOf(this.tradeConfig.VWSize)) {
            let prevVel = this.vel;
            this.vel = price - this.window.lastN(this.tradeConfig.VWSize);
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