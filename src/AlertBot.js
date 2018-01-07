'use strict';

import BootBot from 'bootbot';

const CONFIG = require("../config.json");

class AlertBot {

	constructor() {
		this.bot = new BootBot({
			accessToken: CONFIG.FB_ACCESS_TOKEN,
			verifyToken: CONFIG.FB_VERIFY_TOKEN,
			appSecret: CONFIG.FB_APP_SECRET
		});
		this.chat = undefined;
		this.beginAlert;

		this.bot.on('message', (payload, chat) => {
			if (!this.chat) {
				this.chat = chat;
				chat.say("Hi, welcome to Jerbotron! Enter 'start' to begin receiving alerts.");
			} else {
				const text = payload.message.text;
				chat.say(text);
			}
		});

		this.bot.hear('start', (payload, chat) => {
			chat.say("Beginning alerts now...");
			this.beginAlert = true;
		});

		this.bot.start();
	}

	say(msg) {
		if (this.beginAlert && this.chat) {
			this.chat.say(msg);
		}
	}
}

export {
	AlertBot
}