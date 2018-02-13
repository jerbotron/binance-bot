#!/usr/bin/env node

"use strict";

import Tracker from './src/Tracker'
import DataEngine from './src/DataEngine'
import AlertBot from './src/AlertBot'
import AutoTrader from './src/AutoTrader'
import { Position } from './src/Constants'
import { app } from './src/Webhook'
import Binance from 'binance-api-node'

const CONFIG = require("./config.json");

const client = Binance({
	apiKey: CONFIG.API_KEY,
	apiSecret: CONFIG.API_SECRET
});

/**************************************/
/** EDIT PARAMS BELOW BEFORE TRADING **/
/**************************************/
export const TradeParams = Object.freeze({
	SYMBOL: 'ETHUSDT',
	IS_SIMULATION: false,
	INITIAL_POSITION: Position.BUY,
	MIN_PERCENT_GAIN: 0.20,
	TRADE_QTY: 1,
	WINDOW_SIZE_S: 90
});

const msgBot 		= new AlertBot();
const dataEngine 	= new DataEngine(msgBot);
const tracker 		= new Tracker(client, dataEngine, msgBot);
const autoTrader 	= new AutoTrader(client, dataEngine, tracker, msgBot);

autoTrader.start();
console.log(TradeParams);

app.listen(8080, () => console.log('Jerbotron webhook listening on port 8080...'));

process.on("SIGINT", () => {
	msgBot.exit();
	autoTrader.stop();
	tracker.stop();
	process.exit(0);
});