const WebSocket = require('ws');
const { signPayload, toPrivateKeyObject } = require('../crypto/crypto');
const { sleep } = require('../app/utils');
const { parseJSON } = require('../utils');
const { initServerState, patchServerState, deleteServerState} = require('../handlers/state');
const url = require("url");

function heartbeat(myclient) {
    clearTimeout(myclient.pingTimeout);
    myclient.pingTimeout = setTimeout(() => {
        myclient.terminate();
    }, 15000);
}

const serverClients = {};

function connectServer(remoteServerUrl, adminWSBroadcast, privateKey, reconnect = 0) {
    const wsURL = remoteServerUrl.replace(/^http/, 'ws');
    const serverURL = process.env.CLUSTER_SERVER_URL;

    if (serverClients[remoteServerUrl] && !reconnect) return {error: 'connectServer already started'}

    return new Promise((resolve) => {            
        const token = signPayload({serverURL}, toPrivateKeyObject(privateKey));                

        const client = new WebSocket(wsURL + `?token=${token}&serverURL=${encodeURIComponent(serverURL)}`, {
            maxPayload: 1024**3
        });

        client.on('error', (error) => {
            console.error(error);
            resolve({error});
        });

        client.on('open', () => {
            reconnect = 0;
            serverClients[remoteServerUrl] = { client }
            console.log('Server connected ', remoteServerUrl)
            heartbeat(client);
            resolve(client)
        });

        client.on('close',  async (err) => {
            console.log(`Connection closed ( client ${remoteServerUrl} ) `, err)
            deleteServerState(remoteServerUrl, adminWSBroadcast)
            clearTimeout(client.pingTimeout);            
            const reconnectInterval = Math.min(reconnect * 1000, 30000);
            console.log(`Reconnecting (${reconnect}) after ` + reconnectInterval)
            await sleep(reconnectInterval)            
            connectServer(remoteServerUrl, adminWSBroadcast, privateKey, reconnect + 1)        
        });

        client.on('message', (msg) => {
            heartbeat(client);
            // console.log(remoteServerUrl, msg.toString())
            const data = parseJSON(msg.toString())

            // Handlers
            if (data?.type === 'INIT_STATE' && data?.state) {                
                initServerState(remoteServerUrl, adminWSBroadcast, data?.state)
            } else if (data?.type === 'PATCH_STATE' && data?.delta) {
                patchServerState(remoteServerUrl, adminWSBroadcast, data?.delta)
            }

        });

    });
}

async function connectServers({ serverConnections, privateKey, adminWSBroadcast }) {
    let hasError = false;
    for (const url in serverConnections.data) {        
        const res = await connectServer(url, adminWSBroadcast, privateKey);

        if (res.error) {
            console.log('Unable to connect ' + url)
            hasError = true;
        }
    }

    return hasError === false
}

module.exports = {
    connectServers
}