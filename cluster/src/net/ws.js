const { toPublicKeyObject } = require("../crypto/crypto");
const { getState } = require("../handlers/state");
const { parseJSON } = require("../utils");
const jwt = require('jsonwebtoken');

const adminWSClients = {};
const serversWSClients = {};
let id = 1;
const generateWSId = () => id++;

const heartbeatWatcherIntervalMS = 5000;
const heartbeatIntervalMS = 5000; // this interval WCS will be this value + heartbeatWatcherIntervalMS

const send = (ws, msg) => {
    ws.lastMessageSend = +new Date()
    ws.send(JSON.stringify(msg))
}

const adminWSBroadcast = (data) => {
    for (let wsId in adminWSClients) {
        const ws = adminWSClients[wsId].ws;
        send(ws, data);
    }
}

const serversWSBroadcast = (data) => {
    for (let wsId in serversWSClients) {
        const ws = serversWSClients[wsId].ws;
        send(ws, data);
    }
}

setInterval(() => {
    for (let wsId in adminWSClients) {
        const ws = adminWSClients[wsId].ws;
        if (ws.lastMessageSend && +new Date() - ws.lastMessageSend > heartbeatIntervalMS) {
            send(ws, { type: 'HEARTBEAT', ts: +new Date() })
        }
    }

    for (let wsId in serversWSClients) {
        const ws = serversWSClients[wsId].ws;
        if (ws.lastMessageSend && +new Date() - ws.lastMessageSend > heartbeatIntervalMS) {
            send(ws, { type: 'HEARTBEAT', ts: +new Date() })
        }
    }

}, heartbeatWatcherIntervalMS);


function applyWSListeners({ wss, serverConfig, serverConnections }) {
    const { publicKey } = serverConfig.data;

    wss.on('connection', (ws, req) => {
        ws.wsId = generateWSId();

        const urlParams = new URL(req.url, 'http://example.com').searchParams;

        const token = urlParams.get('token');
        const serverURL = urlParams.get('serverURL');

        if (!token) return ws.close(1008, 'No token provided.');

        if (serverURL && serverConnections?.data?.[serverURL]) {
            const remoteServerPublicKey = serverConnections.data[serverURL].publicKey;

            // Server Connection
            jwt.verify(token, toPublicKeyObject(remoteServerPublicKey), (err, decoded) => {
                if (err) return ws.close(1009, 'Invalid token provided.');

                ws.server = decoded;

                // Init client
                serversWSClients[ws.wsId] = {
                    ws,
                    lastMessageSend: +new Date()
                };

                ws.on('message', message => {
                    const msg = message.toString();
                    const data = parseJSON(msg);

                    if (data !== undefined) {
                        console.log(data);
                    } else {
                        console.log(`Received message is not JSON => ${msg}`)
                    }
                });

                // Delete the WSClient key on websocket close
                ws.on('close', () => {
                    delete serversWSClients[ws.wsId];
                });

                send(ws, { type: 'INIT_STATE', state: getState() })
            });
        } else {
            // Admin Connection
            jwt.verify(token, toPublicKeyObject(publicKey), (err, decoded) => {
                if (err) return ws.close(1008, 'Invalid token provided.');

                ws.user = decoded;

                if (!ws.user.fullPermissions) return ws.close(1008, 'Access denied');

                // Init client
                adminWSClients[ws.wsId] = {
                    ws,
                    lastMessageSend: +new Date()
                };

                ws.on('message', message => {
                    const msg = message.toString();
                    const data = parseJSON(msg);

                    if (data !== undefined) {
                        console.log(data);
                    } else {
                        console.log(`Received message is not JSON => ${msg}`)
                    }
                });

                // Delete the WSClient key on websocket close
                ws.on('close', () => {
                    delete adminWSClients[ws.wsId];
                });

                send(ws, { type: 'INIT_STATE', state: getState() })
            });
        }
    });
}

module.exports = {
    applyWSListeners,
    adminWSBroadcast,
    serversWSBroadcast
}