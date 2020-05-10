#!/usr/bin/env node

"use strict";

module.exports = class SlidingWindow {
    constructor(size) {
        this.len = size;
        this.data = new Array(size);
        this.idx = -1;
        this.counter = 0;
        this.runningSum = 0;
    }

    push(val) {
        if (this.idx + 1 === this.len) {
            this.idx = 0;
        } else {
            this.idx++;
        }
        this.runningSum += val - (this.counter < this.len ? 0 : this.head());
        this.data[this.idx] = val;
        this.counter++;
    }

    // returns the oldest element in window
    head() {
        if (this.counter <= this.len) {
            return this.data[0];
        }
        return this.data[this.counter % this.len];
    }

    // returns element (n-1) elements ago, lastN(1) returns the newest element in the window
    lastN(n) {
        if (n >= this.len) {
            return this.head();
        }
        if (n - 1 <= this.idx) {
            return this.data[this.idx - (n - 1)];
        }
        return this.data[(this.counter - n) % this.len];
    }

    // returns true if we've filled a new set of window data 0 to len
    isFull() {
        return this.counter > 0 && this.counter % this.len === 0;
    }

    isAtMultipleOf(n) {
        return this.counter > 0 && this.counter % n === 0;
    }

    // returns the standard deviation of the window data
    getStd() {
        let u = this.runningSum / this.len;
        let sum = 0.0;
        this.data.forEach(n => {
            sum += Math.pow(n - u, 2);
        });
        return Math.sqrt(sum / this.len);
    }
};