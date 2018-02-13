#!/usr/bin/env node

"use strict";

import Tracker from './src/Tracker'
import DataEngine from './src/DataEngine'
import AlertBot from './src/AlertBot'
import AutoTrader from './src/AutoTrader'
import { Position } from './src/Constants'
import { app } from './src/Webhook'
import Binance from 'binance-api-node'
import AlertBotNoOp from "./src/AlertBotNoOp";


const CONFIG = require("./config.json");

const client = Binance({
    apiKey: CONFIG.API_KEY,
    apiSecret: CONFIG.API_SECRET
});

/**************************************/
/** EDIT PARAMS BELOW BEFORE TRADING **/
/**************************************/
export const TradeParams = Object.freeze({

	SYMBOL: 'BNBUSDT',
	IS_SIMULATION: true,
	INITIAL_POSITION: Position.SELL,
	MIN_PERCENT_GAIN: 0.20,
	TRADE_QTY: 1,
	WINDOW_SIZE_S: 90,
    LOGGING_LEVEL: 'debug'
});


import winston from 'winston'
import { transports, format } from 'winston'
import { printf } from 'winston'

// console.log(winston)
console.log(transports)

const logger = new winston.Logger({
    level: TradeParams.LOGGING_LEVEL,
    format: printf(info => {
        return '${info.timestamp}|${info.level}|${info.message}'
    }),
    transports: [new transports.Console({ colorize: true })]
});
logger.info('Test')


const msgBot 		= new AlertBotNoOp();
const dataEngine 	= new DataEngine(msgBot);
const tracker 		= new Tracker(client, dataEngine, msgBot);
const autoTrader 	= new AutoTrader(client, dataEngine, tracker, msgBot);


// autoTrader.start();
// console.log(TradeParams);

app.listen(8080, () => console.log('Jerbotron webhook listening on port 8080...'));

process.on("SIGINT", () => {
    msgBot.exit();
    autoTrader.stop();
    tracker.stop();
    process.exit(0);
});