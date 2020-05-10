'use strict';

import BootBot from 'bootbot';

const CONFIG = require("../../config.json");

export default class AlertBot {

	constructor() {
		this.bot = new BootBot({
			accessToken: CONFIG.FB_ACCESS_TOKEN,
			verifyToken: CONFIG.FB_VERIFY_TOKEN,
			appSecret: CONFIG.FB_APP_SECRET
		});
		this.chat = undefined;
		this.alertOn = false;

		this.bot.on('message', (payload, chat) => {
			if (!this.chat) {
				this.chat = chat;
				chat.say("Hi, welcome to Jerbotron! Enter 'start' to begin receiving alerts.");
			}
		});

		this.bot.hear('start', (payload, chat) => {
			chat.say("Beginning alerts now...");
			this.alertOn = true;
		});

		this.bot.hear('stop', (payload, chat) => {
			chat.say("Stopping alerts now...");
			this.alertOn = false;
		});

		this.bot.start();
	}

	say(msg) {
		if (this.alertOn && this.chat) {
			this.chat.say(msg);
		}
	}

	exit() {
		this.bot.close();
	}
}