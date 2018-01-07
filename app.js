#!/usr/bin/env node

"use strict";

import { Tracker } from './src/Tracker'
import { app } from './src/Webhook'
import { AlertBot } from './src/AlertBot'

app.listen(8080, () => console.log('Jerbotron webhook listening on port 8080...'));

const bot = new AlertBot();
const tracker = new Tracker(bot);

// tracker.trackAllEth();
// tracker.getMWA('TRXETH', 5);
tracker.trackTrades(["NEOETH"]);

process.on("SIGINT", () => {
	tracker.stop();
	process.exit(0);
});