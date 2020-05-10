#!/usr/bin/env node

"use strict";

const Binance = require('binance-api-node').default;
const app = require('./alertbot/Webhook');

const DataEngine = require('./tradebot/DataEngine');
const CONFIG = require("../config.json");
const dto = require('./dto/Trade.js');

const client = Binance(
    {
        apiKey: CONFIG.API_KEY,
        apiSecret: CONFIG.API_SECRET
    }
);

/**************************************/
/** EDIT PARAMS BELOW BEFORE TRADING **/
/**************************************/
const tradeConfig = new dto.TradeConfig(
    "BTCUSDT",
    1.25,
    9.5,
    5,
    2,
    0.15);
console.log(tradeConfig);

// Initialize App Components
const dataEngine = new DataEngine(client, tradeConfig);

// Start App
app.listen(8080, () => console.log('Jerbotron webhook listening on port 8080...'));
dataEngine.start();

process.on("SIGINT", () => {
    process.exit(0);
});