'use strict'

const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');
const request = require('request');
const Wit = require('node-wit').Wit;
const log = require('node-wit').log;

// Webserver parameter
const PORT = process.env.PORT || 5000;

// Wit.ai parameters
const WIT_TOKEN = process.env.WIT_TOKEN;

// Messenger API parameters
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
if (!FB_PAGE_TOKEN) { throw new Error('missing FB_PAGE_TOKEN') }
const FB_APP_SECRET = process.env.FB_APP_SECRET;
if (!FB_APP_SECRET) { throw new Error('missing FB_APP_SECRET') }

let FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
if (!FB_VERIFY_TOKEN) { throw new Error('missing FB_VERIFY_TOKEN') }

// ----------------------------------------------------------------------------
// Messenger API 

const fbMessage = (id, text) => {
  const body = JSON.stringify({
    recipient: { id },
    message: { text },
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

// ----------------------------------------------------------------------------

const sessions = {};

const findOrCreateSession = (fbid) => {
  let sessionId;
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === fbid) {
      sessionId = k;
    }
  });
  if (!sessionId) {
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}};
  }
  return sessionId;
};

const actions = {
  send({sessionId}, {text}) {
    const recipientId = sessions[sessionId].fbid;
    if (recipientId) {
      
      return fbMessage(recipientId, text)
      .then(() => null)
      .catch((err) => {
        console.error(
          'Oops! An error occurred while forwarding the response to',
          recipientId,
          ':',
          err.stack || err
        );
      });
    } else {
      console.error('Oops! Couldn\'t find user for session:', sessionId);
      return Promise.resolve()
    }
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
  }
};
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


const wit = new Wit({
  accessToken: WIT_TOKEN,
  actions,
  logger: new log.Logger(log.INFO)
});


const app = express();
app.use(({method, url}, rsp, next) => {
  rsp.on('finish', () => {
    console.log(`${rsp.statusCode} ${method} ${url}`);
  });
  next();
});
app.use(bodyParser.json({ verify: verifyRequestSignature }));

// Webhook setup
app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === FB_VERIFY_TOKEN) {
        res.send(req.query['hub.challenge'])
    }
    res.send('Error, wrong token')
})


// Message handler

app.post('/webhook', (req, res) => {
  const data = req.body;

  if (data.object === 'page') {
    data.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message && !event.message.is_echo) {
          console.log(event.message);
          const sender = event.sender.id;

          const sessionId = findOrCreateSession(sender);

          
          const {text, attachments} = event.message;

          if (attachments) {
            // We received an attachment
            // Let's reply with an automatic message
            //fbMessage(sender, "returnOutput").catch(console.error);
              //fbMessage(sender, "Error in reading data. ").catch(console.error);
              
              
              if (attachments == null || attachments.length <= 0 || attachments[0]['payload'] == null || attachments[0]['payload']['coordinates'] == null) {
                fbMessage(sender, "I do not understand this type of data. Sorry!!").catch(console.error);
              } else {

              var lat = attachments[0]['payload']['coordinates'].lat;
              var long = attachments[0]['payload']['coordinates'].long;

              let options = getParkingInfo(lat, long);


              function getParkingInfo(lat, long) {
                return {
                  "url": "https://apis.solarialabs.com/shine/v1/parking-rules/meters",
                  "method": "GET",
                  "qs": {
                    "lat": lat,
                      "long": long,
                      "apikey": "dpAeTEA7PbFCC8zt5fW5CmqStFmRAid6"
                  }
                }
              }

              request(options,(err,resp,body)=>{      
                body = JSON.parse(body);

                if (body.length <= 0) {
                  fbMessage(sender, "Invalid output.").catch(console.error);
                } else {
                  var returnOutput = "Hours of operation: " + body[0]["Hours_of_Operation"] + ". Exception location: " + body[0]["Exceptions_Location"] +". Peak Time: " + body[0]["Peak_Time"] +
                  ". Smart Meter: "  + body[0]["Smart_Meter"] + ". Rate: " + body[0]["Rate"];                  
                    console.log(body);
                    console.log("body0"+body.City);
                     fbMessage(sender, returnOutput).catch(console.error);
                 }
              });
            }
            
            
          } else if (text) {
            
            wit.runActions(
              sessionId, // the user's current session
              text, // the user's message
              sessions[sessionId].context // the user's current session state
            ).then((context) => {
              
              console.log('Waiting for next user messages');

              
              // if (context['done']) {
              //   delete sessions[sessionId];
              // }

              sessions[sessionId].context = context;
            })
            .catch((err) => {
              console.error('Oops! Got an error from Wit: ', err.stack || err);
            })
          }
        } else {
          console.log('received event', JSON.stringify(event));
        }
      });
    });
  }
  res.sendStatus(200);
});



function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', FB_APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

app.listen(PORT);
console.log('Listening on :' + PORT + '...');