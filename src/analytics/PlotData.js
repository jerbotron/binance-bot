#!/usr/bin/env node

"use strict";

class PlotData {
    constructor(name) {
        this.name = name;
        this.x = [];
        this.y = [];
    }

    push(x, y) {
        this.x.push(x);
        this.y.push(y);
    }

    pop() {
        this.x.pop();
        this.y.pop();
    }

    shift() {
        this.x.shift();
        this.y.shift();
    }

    sum() {
        let sum = 0;
        this.y.forEach(n => {
            sum += n;
        });
        return sum;
    }

    getPlotData(options = {}) {
        return {
            x: this.x,
            y: this.y,
            name: this.name,
            type: "scatter",
            ...options
        }
    }
}

module.exports = PlotData;