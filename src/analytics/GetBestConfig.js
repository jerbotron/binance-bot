#!/usr/bin/env node

"use strict";

const fs = require("fs");

class RankedConfig {
    constructor() {
        this.netgain = 0;
        this.gains = [];
    }
}

function sortFile(filename) {
    let sorted = new Map();
    sorted[Symbol.iterator] = function* () {
        yield* [...this.entries()].sort((a, b) => b[1] - a[1]);
    };
    let output = null;
    fs.readFileSync(filename, 'utf-8').split('\n').forEach(line => {
        if (!output) {
            output = line + "\n";
            return;
        }
        sorted.set(line, Number(line.split(',').slice(-1)[0]));
    });
    for (let [key, value] of sorted) {
        output += key + "\n";
    }
    fs.writeFileSync(filename, output);

}

function getBestConfig(dirname) {
    let configMap = new Map();
    configMap[Symbol.iterator] = function* () {
        yield* [...this.entries()].sort((a, b) => b[1] - a[1]);
    };
    fs.readdirSync(dirname).forEach(file => {
        sortFile(dirname + file);
        fs.readFileSync(dirname + file, 'utf-8').split('\n').forEach(line => {
            if (line.startsWith("bb")) return;
            let parts = line.split(',');
            let key = parts.slice(0, 5).join("_");
            if (!configMap.has(key)) {
                configMap.set(key, 0);
            }
            configMap.set(key, configMap.get(key) + Number(parts.slice(-1)[0]));
        });
    });
    return configMap
}

const bestConfigs = getBestConfig("./model/strat_A/2019/");

let i = 0;
for (let [key, value] of bestConfigs) {
    console.log(key + " => " + value);
    i++;
    if (i === 100) {
        break;
    }
}



