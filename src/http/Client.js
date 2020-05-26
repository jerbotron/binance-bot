#!/usr/bin/env node

"use strict";

const http = require('https');
const querystring = require('querystring');

function GetHistoricalKlines(symbol, startTime, endTime, interval = '1m', limit = 1000) {
    const params = {
        'symbol': symbol,
        'interval': interval,
        'startTime': startTime,
        'endTime': endTime,
        'limit': limit
    };
    const path = '/api/v3/klines?' + querystring.stringify(params);
    const options = {
        hostname: 'api.binance.com',
        path: path,
        method: 'GET'
    };
    return new Promise((resolve, reject) => {
        let req = http.request(options, res => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error('statusCode=' + res.statusCode));
            }
            let body = [];
            res.on('data', chunk => {
                body.push(chunk);
            });
            res.on('end', () => {
                try {
                    body = JSON.parse(Buffer.concat(body).toString());
                } catch (e) {
                    reject(e);
                }
                resolve(body);
            });
        });
        req.on('error', err => {
            reject(err);
        });
        req.end();
    });
}

module.exports = {
    GetHistoricalKlines
};