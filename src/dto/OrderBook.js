#!/usr/bin/env node

"use strict";

const {
    Position,
    FilterType
} = require("../common/Constants");

class Balance {
    constructor(symbol, precision = 8) {
        this.symbol = symbol;
        this.precision = precision;
        this.origQty = null;
    }

    update(balance) {
        this.free = Number(balance.free).toPrecision(this.precision);
        this.locked = Number(balance.locked).toPrecision(this.precision);
        if (!this.origQty) {
            this.origQty = this.free;
        }
    }
}

/*\
    OrderBook contains the user's account info for the specified trading symbol.
    * data: https://github.com/binance-exchange/binance-api-node#accountinfo
 */
class OrderBook {
    constructor(client, symbol, data, eventLogger) {
        this.client = client;
        data.symbols.forEach(asset => {
            if (asset.symbol === symbol) {
                this.precision = Number(asset.baseAssetPrecision);
                this.baseBalance = new Balance(asset.baseAsset, this.precision);
                this.quoteBalance = new Balance(asset.quoteAsset, this.precision);
                this.bnbBalance = new Balance("BNB");
                asset.filters.forEach(filter => {
                    switch (filter) {
                        case FilterType.PRICE_FILTER:
                            this.minTick = Number(filter.tickSize);
                            break;
                        case FilterType.LOT_SIZE:
                            this.minQty = Number(filter.minQty);
                            break;
                        case FilterType.MIN_NOTIONAL:
                            this.minNotional = Number(filter.minNotional);
                            break;
                    }
                })
            }
        });
        this.logger = eventLogger;
        this.lastPrice = 0;
        this.updateBalances().then(() => {
            this.logger.logStart(this.baseBalance, this.quoteBalance);
        });
    }

    async updateBalances() {
        try {
            return this.client.accountInfo().then(res => {
                res.balances.forEach(balance => {
                    if (balance.asset === this.baseBalance.symbol) {
                        this.baseBalance.update(balance);
                    } else if (balance.asset === this.quoteBalance.symbol) {
                        this.quoteBalance.update(balance);
                    } else if (balance.asset === "BNB") {
                        this.bnbBalance.update(balance);
                    }
                });
            });
        } catch (e) {
            // this.msgBot.say("Errored in getAccountInfo()");
            this.logger.logError("Error: updateBalances() failed to get account info, " + e);
        }
    }

    getTradeQty(pos, price) {
        let qty = 0;
        if (pos === Position.BUY) {
            qty = Math.floor(this.quoteBalance.free / price);
            this.lastPrice = price;
        } else if (pos === Position.SELL) {
            qty = Math.floor(this.baseBalance.free / price);
        } else {
            this.logger.logError("Error: getTradeQty(), unexpected position, " + pos);
            return 0;
        }
        return Number(qty.toPrecision(this.precision))
    }

    stop() {
        this.logger.logStop(this.baseBalance, this.quoteBalance);
    }
}

module.exports = OrderBook;