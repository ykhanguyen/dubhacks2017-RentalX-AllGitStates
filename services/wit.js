'use strict'

var Config = require('../config')
var FB = require('../connectors/facebook')
var Wit = require('node-wit').Wit
var request = require('request')


const firstEntityValue = (entities, entity) => {
    const val = entities && entities[entity] &&
            Array.isArray(entities[entity]) &&
            entities[entity].length > 0 &&
            entities[entity][0].value
        ;
    if (!val) {
        return null;
    }
    return typeof val === 'object' ? val.value : val;
};


const actions = {
    send(request, response) {
        const {sessionId, context, entities} = request;
        const {text, quickreplies} = response;
        console.log('sending...', JSON.stringify(response));
    },
    getWord({context, entities}) {
        var word = firstEntityValue(entities, 'word');
        if (word) {
            context.confirm = word;
            delete context.missingWord;
        } else {
            context.missingWord = true;
            delete context.confirm;
        }
        return context;
    },
};

