#!/usr/bin/env node

"use strict";

import Tracker from './src/Tracker'
import AlertBot from './src/AlertBot'
import AutoTrader from './src/AutoTrader'
import { app } from './src/Webhook'

import Binance from 'binance-api-node'

const CONFIG = require("./config.json");

const client = Binance({
	apiKey: CONFIG.API_KEY,
	apiSecret: CONFIG.API_SECRET
});

app.listen(8080, () => console.log('Jerbotron webhook listening on port 8080...'));

const msgBot = new AlertBot();
const tracker = new Tracker(client, msgBot);

// tracker.trackAllEth(1, 3);
tracker.trackTicker('VENBNB', 300);
// tracker.trackTicker('BNBUSDT', 300);

process.on("SIGINT", () => {
	tracker.stop();
	process.exit(0);
});