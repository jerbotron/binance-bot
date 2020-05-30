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
        position = Position.BUY,
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
        console.log(`* BB: ${this.bb}\n* S: ${this.s}\n* wSize: ${this.wSize}\n* vwSize: ${this.vwSize}\n* sT: ${this.stopLimit.toFixed(2)}\n* position: ${this.position}\n* isSimulation: ${this.isSimulation}`);
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
    TradeStrategyA holds the snapshot data for an interval of time and evaluates trade decisions as it appends new data.
    * snapshotData: initial window data used to initialize the snapshot
        * In LIVE mode, it's retrieved from https://github.com/binance-exchange/binance-official-api-docs/blob/master/rest-api.md#klinecandlestick-data
        * in TRAINING mode, it's in the format of src/analytics/data logs
 */
class TradeStrategyA {
    constructor(
        tradeConfig,
        snapshotData,
        liveMode = true,
        velAccHandler = () => {
        }
    ) {
        this.tradeConfig = tradeConfig;
        this.window = new SlidingWindow(tradeConfig.wSize);
        this.s = this.tradeConfig.s / (1.0 + this.tradeConfig.wSize);
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

    updateAndEvaluateTradeDecision(pos,
                                   candle,
                                   decisionHandler = () => {
                                   },
                                   velAccHandler = () => {
                                   }
    ) {
        // Update window data and set timestamp
        let close = Number(candle.close);
        this.window.push(close);
        this.timestamp = candle.eventType === "kline" ? new Date(candle.eventTime) : candle.eventTime;

        // Update trade signals
        let std = this.window.getStd();
        this.ema = close * this.s + this.ema * (1 - this.s);
        this.floor = this.ema - this.tradeConfig.bb * std;
        this.ceiling = this.ema + this.tradeConfig.bb * std;
        let [curVel, curAcc] = this.updateVelAndAcc(candle.eventTime, close, velAccHandler);

        // evaluate trade decision
        if (pos === Position.BUY && close <= this.floor && curVel < 0 && curAcc > 0) {
            this.prevBuy = close;
            decisionHandler(new TradeDecision(this.timestamp, Position.BUY, this.tradeConfig.symbol, close));
        } else if (pos === Position.SELL) {
            let gain = this.prevBuy ? close - this.prevBuy : 0;
            let lossThreshold = this.prevBuy ? 1 - (close / this.prevBuy) : 0;
            if ((close >= this.ceiling && curVel > 0 && curAcc < 0 && gain >= 0) ||
                lossThreshold >= this.tradeConfig.stopLimit) {
                decisionHandler(new TradeDecision(this.timestamp, Position.SELL, this.tradeConfig.symbol, close));
            }
        }
    }

    // returns [curVel, curAcc] as an array
    updateVelAndAcc(timestamp,
                    close,
                    handler = () => {
                    }
    ) {
        let curVel = close - this.window.lastN(this.tradeConfig.vwSize);
        let curAcc = curVel - this.vel;
        handler(timestamp, curVel, curAcc);
        // Update vel/acc references at vWSize intervals
        if (this.window.isAtMultipleOf(this.tradeConfig.vwSize)) {
            this.acc = curVel - this.vel;
            this.vel = curVel;
        }
        return [curVel, curAcc]
    }
}

class TradeStrategyB {
    constructor(
        tradeConfig,
        snapshotData,
        liveMode = true
    ) {
        this.tradeConfig = tradeConfig;
        this.window = new SlidingWindow(tradeConfig.wSize);
        this.s = this.tradeConfig.s / (1.0 + this.tradeConfig.wSize);
        for (let i = 0; i < snapshotData.length; i++) {
            let close = Number(snapshotData[i][4]);
            this.ema = close;
            this.window.push(close);
        }

        this.timestamp = liveMode ? new Date(snapshotData.slice(-1)[0][0]) : snapshotData.slice(-1)[0][0];
        this.prevBuy = null;
    }

    updateAndEvaluateTradeDecision(pos,
                                   candle,
                                   decisionHandler = () => {
                                   },
                                   velAccHandler = () => {
                                   }
    ) {
        // Update window data and set timestamp
        let close = Number(candle.close);
        this.window.push(close);
        this.timestamp = candle.eventType === "kline" ? new Date(candle.eventTime) : candle.eventTime;

        // Update trade signals
        let std = this.window.getStd();
        this.ema = close * this.s + this.ema * (1 - this.s);
        this.floor = this.ema - this.tradeConfig.bb * std;
        this.ceiling = this.ema + this.tradeConfig.bb * std;

        if (close <= this.floor || close >= this.ceiling) {
            let [curVel, curAcc] = this.updateVelAndAcc(this.timestamp, close, velAccHandler);

            // evaluate trade decision
            if (pos === Position.BUY && close <= this.floor && curVel < 0 && curAcc > 0) {
                this.prevBuy = close;
                decisionHandler(new TradeDecision(this.timestamp, Position.BUY, this.tradeConfig.symbol, close));
            } else if (pos === Position.SELL && close >= this.ceiling) {
                let gain = this.prevBuy ? close - this.prevBuy : 0;
                let lossThreshold = this.prevBuy ? 1 - (close / this.prevBuy) : 0;
                if ((curVel > 0 && curAcc < 0 && gain >= 0) || lossThreshold >= this.tradeConfig.stopLimit) {
                    decisionHandler(new TradeDecision(this.timestamp, Position.SELL, this.tradeConfig.symbol, close));
                }
            }
        } else {
            velAccHandler(this.timestamp, 0, 0);
        }
    }

    // returns [curVel, curAcc] as an array
    updateVelAndAcc(timestamp,
                    close,
                    handler = () => {
                    }
    ) {
        let curVel = close - this.window.lastN(this.tradeConfig.vwSize);
        let prevVel = this.window.lastN(this.tradeConfig.vwSize) - this.window.lastN(this.tradeConfig.vwSize * 2);
        let curAcc = curVel - prevVel;
        handler(timestamp, curVel, curAcc);
        return [curVel, curAcc]
    }
}

module.exports = {
    TradeConfig,
    TradeDecision,
    TradeStrategyA,
    TradeStrategyB
};