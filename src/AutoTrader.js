#!/usr/bin/env node

"use strict";

import Rx from 'rxjs/Rx'
import { 
	Position,
	OrderType
} from './Constants.js'
import OrderManager from './OrderManager.js'

export default class AutoTrader {

	constructor(client, dataEngine, tracker, msgBot, tradeParams) {
        this.client = client;
		this.dataEngine = dataEngine;
        this.tracker = tracker;
        this.msgBot = msgBot;
        this.symbol = tradeParams.SYMBOL;
        this.tradeParams = tradeParams;
		this.orderManager = new OrderManager(this, client, msgBot, tradeParams);

		this.prevPrice = null;
		this.baseBalance = null;
		this.quoteBalance = null;

		this.tickerAsk = null;
		this.tickerBid = null; 

		this.init();
	}

	init() {
		this.getExchangeInfo().then(res => {
			this.initTradeInfo(res.symbols);
			this.getAccountInfo().then(res => {
				this.initAccountInfo(res.balances);
				this.position = this.tradeParams.INITIAL_POSITION;
			});
		});
	}

	initTradeInfo(symbols) {
		this.orderManager.init(symbols);
	}

	initAccountInfo(balances) {
		this.orderManager.setBalances(balances);
	}

	start() {
		this.subscribeTrade();
		this.subscribeTicker();
		// this.tracker.trackTicker(this.symbol);
		this.tracker.trackTrades([this.symbol]);
	}

	stop() {
		this.tracker.stop();
		this.unsubscribeTrade();
		this.unsubscribeTicker();
	}

	setPosition(position) {
		this.position = position;
	}

	togglePosition(currentPosition) {
		this.position = (currentPosition == Position.BUY) ? Position.SELL : Position.BUY;
	}

	subscribeTrade() {
		this.tradeSubscription = this.dataEngine.alertPriceChange()
											  	.subscribeOn(Rx.Scheduler.asap)
											  	.observeOn(Rx.Scheduler.queue)
											  	.subscribe(this.autoTrade());
	}

	subscribeTicker() {
		this.tickerSubscription = this.dataEngine.alertTickerChange()
												 .subscribeOn(Rx.Scheduler.asap)
											  	 .observeOn(Rx.Scheduler.queue)
											  	 .subscribe(this.updateTickers());
	}

	unsubscribeTrade() {
		this.tradeSubscription.unsubscribe();
	}

	unsubscribeTicker() {
		this.tickerSubscription.unsubscribe();
	}

	updateTickers() {
		return Rx.Subscriber.create(
			// x = TickerData object
			x => {
				this.tickerAsk = x.ask;
				this.tickerBid = x.bid;
				this.orderManager.updateTickers(x);
			},
			e => {
				console.log(`onError: ${e}`);
				this.msgBot.say(`onError: ${e}`);
			},
			() => {
				console.log('onCompleted');
			}
		);
	}

	autoTrade() {
		return Rx.Subscriber.create(
			// x = TradeData object
			x => {
				switch (this.position) {					
					case Position.BUY: {						
						if (this.shouldBuy_3(x)) 
						{
							this.orderManager.executeBuy(x.price);							
						}
						this.prevPrice = x.price;
						break;
					}
					case Position.SELL: {
						if (this.shouldSell_3(x))
						{
							this.orderManager.executeSell(x.price);
						}
						this.prevPrice = x.price;
						break;
					}
					case Position.PENDING:
					default:
						return;
				}
			},
			e => {
				console.log(`onError: ${e}`);
				this.msgBot.say(`onError: ${e}`);
			},
			() => {
				console.log('onCompleted');
			}
		);
	}

	shouldBuy_1(x) {
		console.log(`${x.timestamp}\t${this.position}\t${x.price}\t${x.floor}\t${x.ma}`);
		return x.price >= this.prevPrice &&
			   x.price > x.floor &&
			   x.price < x.ma;
	}

	shouldBuy_2(x) {
		console.log(`${x.timestamp}\t${this.position}\t${x.price}\t${x.floor}\t${x.ma-x.std}`);
		return x.price > x.floor && 
			   x.price < (x.ma - x.std);
	}

	shouldBuy_3(x) {
		console.log(`${x.timestamp}\t${this.position}\t${x.price}\t${x.getP10()}`);
		return x.price <= x.getP10() && 
			   x.price >= this.prevPrice;
	}

	shouldSell_1(x) {
		let percentGain = this.orderManager.getPercentGain(x.price);
		console.log(`${x.timestamp}\t${this.position}\t${price}\t${x.ma}\t${percentGain}`);
		return x.price <= this.prevPrice &&
			   (percentGain == null || percentGain >= this.tradeParams.MIN_PERCENT_GAIN) &&
			   x.price > x.ma;
	}

	shouldSell_2(x) {
		let percentGain = this.orderManager.getPercentGain(x.price);
		console.log(`${x.timestamp}\t${this.position}\t${x.price}\t${x.ma+x.std}\t${percentGain}`);
		return (percentGain == null || percentGain >= this.tradeParams.MIN_PERCENT_GAIN) &&
				x.price > x.ma + x.std;
	}

	shouldSell_3(x) {
		let percentGain = this.orderManager.getPercentGain(x.price);
		console.log(`${x.timestamp}\t${this.position}\t${x.price}\t${x.getP90()}\t${percentGain}`);
		return x.price >= x.getP90() && 
			   x.price <= this.prevPrice &&
			   (percentGain == null || percentGain >= this.tradeParams.MIN_PERCENT_GAIN);
	}

	async getExchangeInfo() {
		try {
			return await this.client.exchangeInfo();
		} catch(e) {
			console.log(e);
			this.msgBot.say("Errored in getExchangeInfo()");
		}
	}

	async getAccountInfo() {
		try {
			return await this.client.accountInfo();
		} catch(e) {
			console.log(e);
			this.msgBot.say("Errored in getAccountInfo()");  
		}
	}

	async orderTest(price, qty, type = OrderType.LIMIT) {
		try {
			let order = {
				symbol: this.symbol,
				side: 'SELL',
				type: type,
				quantity: qty
			}
			if (type == OrderType.LIMIT) {
				order.price = price;
			}
			return await this.client.orderTest(order);
		} catch(e) {
			console.log(e);
		}
	}
}
