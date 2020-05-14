#!/usr/bin/env node

"use strict";

// Candle converts line data from src/analytics/data file to a candle response from here
// https://github.com/binance-exchange/binance-api-node#candles-1
class Candle {
    constructor(data) {
        this.eventType = "log";     // indicates we are forming this candle with log data
        this.eventTime = data[0];
        this.open = data[1];
        this.high = data[2];
        this.low = data[3];
        this.close = data[4];
        this.volume = data[5];
    }
}

module.exports = {Candle};

