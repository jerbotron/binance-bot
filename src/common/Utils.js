#!/usr/bin/env node

"use strict";

const formatDate = date => {
    return date.toISOString().split('.')[0].replace('T', ' ')
};

function roundDown(number, decimals = 0) {
    return (Math.floor(number * Math.pow(10, decimals)) / Math.pow(10, decimals));
}

module.exports = {
    formatDate,
    roundDown
};