#!/usr/bin/env node

"use strict";

const Binance = require('binance-api-node').default;
var figlet = require('figlet');

const app = require('./alertbot/Webhook');
const DataEngine = require('./tradebot/DataEngine');
const AutoTrader = require('./tradebot/AutoTrader');
const EventLogger = require('./tradebot/EventLogger');
const CONFIG = require("./../config.json");
const {
    TradeConfig
} = require('./dto/Trade.js');
const {
    Position
} = require('./common/Constants');

const client = Binance(
    {
        apiKey: CONFIG.API_KEY,
        apiSecret: CONFIG.API_SECRET
    }
);

function main() {
    console.log(figlet.textSync('spark bot.', '3D-ASCII'));

    const tradeConfig = new TradeConfig(
        "BTCUSDT",
        2,
        4,
        80,
        3,
        0.01,
        Position.BUY);
    tradeConfig.log();

    // Initialize App Components
    const eventLogger = new EventLogger(tradeConfig.symbol);
    const dataEngine = new DataEngine(client, tradeConfig, eventLogger);
    const autoTrader = new AutoTrader(client, tradeConfig.symbol, dataEngine, eventLogger);

    // Start App
    app.listen(8080, () => console.log('Jerbotron webhook listening on port 8080...'));
    dataEngine.start();

    process.on("SIGINT", () => {
        dataEngine.stop();
        autoTrader.stop();
        eventLogger.stop();
        process.exit(0);
    });
}

main();