#!/usr/bin/env node

"use strict";

const formatDate = date => {
    return date.toISOString().split('.')[0].replace('T', ' ')
};

module.exports = {
    formatDate
};