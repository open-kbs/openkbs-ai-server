const net = require('net');
const crypto = require('crypto');
const { GET_PIPES_REQUEST, GET_PIPES_RESPONSE, STREAM } = require('../constants');


const unixSocketClients = {};
const requestsQ = {};

const getTime = () => new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')

function generateUUID() {
    const timestamp = Date.now().toString(16);
    const randomBytes = crypto.randomBytes(2).toString('hex');
    return `${timestamp}-${randomBytes}`;
}

async function unixSocketBroadcast(message, socketSuffix = '') {
    // Create an array to hold the promises
    let promises = [];

    // Push the promises into the array
    for (let CUDA_VISIBLE_DEVICES of Object.keys(unixSocketClients)) {
        promises.push(new Promise((resolve, reject) => {
            unixSocketSend(unixSocketClients[CUDA_VISIBLE_DEVICES]['socket' + socketSuffix], message, resolve);
        }));
    }

    // Wait for all promises to resolve
    return await Promise.all(promises);
}

async function unixSocketSend(socket, msg, parrentResolve = null, timeout = 260, callback = null) {
    const promise = new Promise((resolve, reject) => {
        msg.uuid = generateUUID();
        
        const deviceId = socket.CUDA_VISIBLE_DEVICES;

        // Set up the timeout
        const timer = setTimeout(() => {
            delete requestsQ[deviceId][msg.uuid];
            resolve({error: `Request timed out after ${timeout} seconds`});
        }, timeout*1000);
        
        requestsQ[deviceId] = requestsQ[deviceId] || {};

        requestsQ[deviceId][msg.uuid] = {resolve, parrentResolve, callback}
        if (msg?.pipeId) requestsQ[deviceId][msg.uuid].pipeId = msg.pipeId

        if (socket.listenerCount('data') === 0) {
            socket.on('data', (data) => {        
                if (data?.toString()?.length < 20000) {
                    if (!data?.toString()?.includes(GET_PIPES_RESPONSE)) {
                        console.log(getTime() + ' Received:', data.toString());
                    }                    
                }
                const messages = data?.toString().split('\n');

                messages.forEach(responseMessage => {
                    if (!responseMessage) return;
                    // console.log('responseMessage', responseMessage);
                    const response = JSON.parse(responseMessage);

                    const msgResolve = () => {
                        requestsQ[deviceId][response.uuid]?.resolve(response);
                        requestsQ[deviceId][response.uuid]?.parrentResolve?.(response);
                        clearTimeout(timer)
                        delete requestsQ[deviceId][response.uuid];
                    }

                    /**
                     * RESPONSE HANDLERS 
                     */
                    if (response?.type === STREAM && requestsQ?.[deviceId]?.[response?.uuid]?.callback) {
                        requestsQ[deviceId][response?.uuid].callback(response, msgResolve)
                    }
                                        
                    if (requestsQ[deviceId][response.uuid] && response?.type !== STREAM) {
                        msgResolve();
                    }
                });
            });
        }

        socket.write(JSON.stringify(msg) + '\n');
    });

    return promise;
}

async function unixSocketConnect(CUDA_VISIBLE_DEVICES, isReconnect = false, suffix = '') {
    return new Promise((resolve, reject) => {

        // Create a client instance
        const client = net.createConnection({ path: `./unix${CUDA_VISIBLE_DEVICES}.sock` + suffix });

        client.CUDA_VISIBLE_DEVICES = CUDA_VISIBLE_DEVICES
        client.on('connect', async () => {
            resolve(client)
            console.log(`CUDA_VISIBLE_DEVICES ${CUDA_VISIBLE_DEVICES} connected`);

            if (isReconnect) {
                // Reconnect logic goes here
            }
        });

        client.on('error', (error) => {
            console.log('Connection failed', error);        
        });

        client.on('end', () => {
            console.log('Disconnected from Python daemon');
        });

    });
}

module.exports = {
    unixSocketClients,
    unixSocketConnect,
    unixSocketSend,
    requestsQ,
    unixSocketBroadcast,
    generateUUID
}