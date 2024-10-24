const { CALL_PIPE_REQUEST, DELETE_PIPE_REQUEST } = require("../constants");
const { getState, updateState } = require("../handlers/state");
const { unixSocketSend, unixSocketClients, generateUUID } = require("../net/unixSocket");
const fs = require('fs');
const util = require('util');
const { calculateTotal, sortArrayByProperties, sleep, createPipeLoadedSortFunction, decodeJWT} = require("./utils");
const readFile = util.promisify(fs.readFile);
const jsondiffpatch = require('jsondiffpatch');
const http = require('http');
const https = require('https');
const { deepCopy, getAudioDuration} = require("../utils");
const { signPayload, toPrivateKeyObject } = require("../crypto/crypto");
const axios = require('axios');
const sharp = require('sharp');
const {resetFanSpeed} = require("../handlers/nvidiaSettings");
const os = require('os');

function createServerToken(privateKey) {
    let payload = { serverURL: process.env.CLUSTER_SERVER_URL, fullPermissions: true };
    const token = signPayload(payload, toPrivateKeyObject(privateKey), 1000 * 60); // just one minute exp
    return token;
}

const models = process.env.MODELS_JSON ? JSON.parse(process.env.MODELS_JSON) : {};

function applyPipeRoutes({ app, Auth, AuthFromServer, privateKey, adminWSBroadcast, serversWSBroadcast }) {

    // Public
    app.get('/pipe/checkme', async (req, res) => {
        const response = {
            time: +new Date(),
            hostname: os.hostname(),
            ...(req.query.headers === '1' && { headers: req.headers })
        };
        res.status(200).send(response);
    });

    // Public
    app.get('/pipe/models', async (req, res) => {
        res.status(200).send(models);
    });

    // Call from remote authorized server
    app.post('/pipeCallFromRemoteServer/:pipeId', AuthFromServer, async (req, res) => {
        const { pipeId } = req.params;
        const { deviceId, requiredVRAM, ...payload } = req.body;
        callPipeRequestHandler({ fromRemoteServer: true, deviceId, requiredVRAM, pipeId, payload, adminWSBroadcast, serversWSBroadcast, res });
    });

    // Access via admin panel
    app.get('/admin/pipe/batchUpscale/:pipeId', Auth, async (req, res) => {
        const { pipeId } = req.params;
        const { deviceId, ...payload } = req.query;
        callBatchUpscale({
            deviceId, pipeId, payload, adminWSBroadcast, serversWSBroadcast, privateKey, res
        });
    });

    // Access via admin panel
    app.get('/admin/pipe/:pipeId', Auth, async (req, res) => {
        const { pipeId } = req.params;
        const { deviceId, ...payload } = req.query;
        callPipeRequestHandler({
            deviceId, pipeId, payload, adminWSBroadcast, serversWSBroadcast, privateKey, res
        });
    });

    /**
     * Client Endpoints below are authorized/paid with transactionJWT
     */

    // Client Endpoint
    app.get('/pipe/crop', handleCrop);

    // Client Endpoint (batchUpscale deprecated)
    app.get('/pipe/batchUpscale/:pipeId', async (req, res) => {
        const { pipeId } = req.params;
        let { deviceId, transactionJWT, ...payload } = req.query;

        transactionJWT = transactionJWT || req?.headers?.['transaction-jwt'];

        callBatchUpscale({
            deviceId, pipeId, payload, adminWSBroadcast, serversWSBroadcast, privateKey, res, transactionJWT, paymentRequired: true
        });
    });

    // Client Endpoint (GET Method)
    app.get('/pipe/:pipeId', async (req, res) => {
        const { pipeId } = req.params;
        let { deviceId, transactionJWT, ...payload } = req.query;

        transactionJWT = transactionJWT || req?.headers?.['transaction-jwt'];

        callPipeRequestHandler({
            deviceId, pipeId, payload, adminWSBroadcast, serversWSBroadcast, privateKey, res, transactionJWT, paymentRequired: true
        });
    });

    // Client Endpoint (POST Method)
    app.post('/pipe/:pipeId', async (req, res) => {
        const { pipeId } = req.params;
        let { deviceId, transactionJWT, ...payload } = req.body;

        transactionJWT = transactionJWT || req?.headers?.['transaction-jwt'];

        callPipeRequestHandler({
            deviceId, pipeId, payload, adminWSBroadcast, serversWSBroadcast, privateKey, res, transactionJWT, paymentRequired: true
        });
    });
}

// We can offload this outside of this main nodejs process
const handleCrop = async (req, res) => {
    try {
        let { x,y,width,height,image, transactionJWT } = req.query;

        transactionJWT = transactionJWT || req?.headers?.['transaction-jwt'];

        if (!(await handlePayment({pipeId: 'crop', payload: {x,y,width,height,image}, transactionJWT, res}))) return;

        let [response] = await Promise.all([
            axios.get(image, { responseType: 'arraybuffer' })
        ]);

        const imageBuffer = Buffer.from(response.data, 'binary');

        // Crop the image
        const outputBuffer = await sharp(imageBuffer)
            .extract({
                left: parseFloat(x),
                top: parseFloat(y),
                width: parseFloat(width),
                height: parseFloat(height)
            })
            .toBuffer();

        // Send the cropped image
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end(outputBuffer, 'binary');
    } catch (err) {
        if (err?.response?.status === 499) {
            res.status(499).send({error: 'Unable to process transaction'});
        } else if (err?.response?.status && err?.response?.data) {
            res.status(err?.response?.status).send({...err?.response?.data});
        } else {
            res.status(500).send({error: 'transaction failed'});
        }
        if (err?.response?.data) console.log(err?.response?.data)
        return false;
    }
}

function haveEnoughFreeVRAM(device, requiredVRAM) {
    const freeMB = calculateTotal(device, 'memory_free');
    const totalMB = calculateTotal(device, 'memory_total');

    if (requiredVRAM) {
        const offset = 0.1; // allow some memory offset
        let diff = freeMB * (1024 ** 2) - parseInt(requiredVRAM) - totalMB * (1024 ** 2) * offset;
        diff -= diff * offset;
        return Math.round(diff) > 0
    } else {
        return true;
    }

}

function haveEnoughTotalVRAM(device, requiredVRAM) {
    return true // with cpu offload GPUs can load larger models
    const totalMB = calculateTotal(device, 'memory_total');
    return totalMB * (1024 ** 2) > requiredVRAM
}

function addDeviceSortParams(device) {
    device.freeMB = calculateTotal(device, 'memory_free');
    device.maxTflops = calculateTotal(device, 'max_tflops', parseFloat);
    device.powerLimit = calculateTotal(device, 'power_limit', parseFloat);
    device.queueSize = device?.queue?.length ? device.queue.length : 0;
    device.isLocal = device.serverURL === process.env.CLUSTER_SERVER_URL ? 1 : 0;
    return device;
}

function findDevicesLoaded(pipeId) {
    const state = getState();
    const [vendor, model, pipeName] = pipeId.split('--');

    let servers = [];

    for (let url in state) {
        servers.push({ url, ...state[url] })
    }

    // get all devices where pipeId is loaded
    let availableDevices = [];
    let requiredVRAM;
    for (const server of servers) {
        requiredVRAM = server.models?.[vendor]?.[model]?.size;

        server.devices = server.devices?.
        filter(device => device.pipes?.includes(pipeId) && device.frozen && !device?.queue?.length)
            ?.map(device => addDeviceSortParams({
                requiredVRAM,
                enoughFreeVRAM: haveEnoughFreeVRAM(device, requiredVRAM),
                serverURL: server.url,
                ...device
            }))

        if (server.devices?.length) availableDevices.push(...server.devices);
    }

    return availableDevices;
}

function findBestDevice(state, pipeId, fromRemoteServer) {
    const [vendor, model, pipeName] = pipeId.split('--');

    let servers = [];
    
    for (let url in state) {
        // if requested from fromRemoteServer, return only local devices
        if (fromRemoteServer && url !== process.env.CLUSTER_SERVER_URL) continue;
        servers.push({ url, ...state[url] })
    }

    // filter out servers where model is NOT INSTALLED
    servers = servers.filter(server => server.models?.[vendor]?.[model]?.status === 'INSTALLED')

    if (!servers?.length) {
        return { error: `Model ${vendor}/${model} not installed` };
    }

    // get all devices where pipeId is loaded OR device is NOT frozen
    let availableDevices = [];
    let requiredVRAM;
    for (const server of servers) {
        requiredVRAM = server.models?.[vendor]?.[model]?.size;

        // filter out disabled devices
        server.devices = server.devices?.filter(device => !device.disabled);

        server.devices = server.devices?.
            filter(device => device.pipes?.includes(pipeId) || !device.frozen && haveEnoughTotalVRAM(device, requiredVRAM))
            ?.map(device => addDeviceSortParams({
                requiredVRAM,
                enoughFreeVRAM: haveEnoughFreeVRAM(device, requiredVRAM),
                serverURL: server.url,
                ...device
            }))

        if (server.devices?.length) availableDevices.push(...server.devices);
    }

    if (!availableDevices?.length) {
        return { error: `No available devices to load ${pipeId}` };
    }

    // (PipeLoaded or not frozen) && WithoutQueue, sorted by maxTflops, powerLimit, isLocal
    const pipeLoadedSortFunction = createPipeLoadedSortFunction(pipeId);
    const devicesWherePipeIsLoadedWithoutQueue = sortArrayByProperties(
        availableDevices.filter(device => !device?.queue?.length && (device?.pipes?.includes(pipeId) || !device.frozen)),
        ['maxTflops', 'powerLimit', pipeLoadedSortFunction, 'isLocal']
    );

    if (devicesWherePipeIsLoadedWithoutQueue?.length) {
        return devicesWherePipeIsLoadedWithoutQueue[0]
    }

    // EnoughFreeVRAM && WithoutQueue, sorted by maxTflops, powerLimit, isLocal 
    const devicesEnoughFreeVRAMWithoutQueue = sortArrayByProperties(
        availableDevices.filter(device => !device?.queue?.length && device?.enoughFreeVRAM),
        ['maxTflops', 'powerLimit', 'isLocal']);

    if (devicesEnoughFreeVRAMWithoutQueue?.length) {
        return devicesEnoughFreeVRAMWithoutQueue[0]
    }

    // // NotEnoughFreeVRAM && WithoutQueue
    const devicesIdleWithoutQueue = sortArrayByProperties(
        availableDevices.filter(device => !device?.queue?.length && !device?.enoughFreeVRAM),
        ['maxTflops', 'powerLimit', 'isLocal']
    );

    if (devicesIdleWithoutQueue?.length) {
        return devicesIdleWithoutQueue[0]
    }


    // PipeLoaded WithQueue, sorted by queue and pastTime in the queue
    const devicesWherePipeIsLoadedWithQueue = sortArrayByProperties(
        availableDevices.filter(device => device?.queue?.length), ['-queueSize', '-timeStarted']
    );

    if (devicesWherePipeIsLoadedWithQueue?.length) {
        return devicesWherePipeIsLoadedWithQueue[0]
    }

}

function addQueueItem({ serverURL, deviceId, queueItem, adminWSBroadcast, serversWSBroadcast }) {
    const state = getState();
    const newState = deepCopy(state);
    
    newState[serverURL]
        .devices
        ?.find(device => device.deviceId === deviceId)
        ?.queue
        ?.push(deepCopy(queueItem));
    let delta = jsondiffpatch.diff(state, newState);    

    if (delta) updateState({ delta, adminWSBroadcast, serversWSBroadcast })
}

function removeQueueItem({ serverURL, deviceId, queueItem, adminWSBroadcast, serversWSBroadcast }) {
    const state = getState();
    const newState = deepCopy(state);

    // Remove from the state
    const device = newState[serverURL].devices?.find(device => device.deviceId === deviceId);
    if (device) {
        const queueIndex = device.queue.findIndex(item => item.uuid === queueItem.uuid);
        if (queueIndex !== -1) {
            device.queue.splice(queueIndex, 1);
        }
    }

    // Calculate the difference and update the state if there are changes
    let delta = jsondiffpatch.diff(state, newState);

    if (delta) {
        updateState({ delta, adminWSBroadcast, serversWSBroadcast });
    }
}

async function handleFindDevice(pipeId, res, fromRemoteServer) {
    const state = getState();
    let bestDeviceFound = findBestDevice(state, pipeId, fromRemoteServer)

    if (bestDeviceFound?.error) {
        return res.status(404).send({ error: bestDeviceFound.error });
    }

        /* 
        bestDeviceFound
        {
            requiredVRAM: 123,
            enoughFreeVRAM: false,
            serverURL: 'http://localhost:8080/',
            deviceId: '0',
            frozen: false,
            queue: [],
            pipes: [
            'stabilityai--stable-diffusion-2-1--default',
            'stabilityai--stable-diffusion-xl-base-1.0--inpaint-with-controlnet',
            'meta-llama--Llama-2-7b-chat-hf--default'
            ],
            gpus: [ [Object] ],
            freeMB: 1961,
            maxTflops: 44.71,
            powerLimit: 350,
            queueSize: 0,
            isLocal: 1
        }
        ]*/

    return {
        requiredVRAM: bestDeviceFound?.requiredVRAM,
        serverURL: bestDeviceFound?.serverURL,
        deviceId: bestDeviceFound?.deviceId
    };
}

async function handleLocalInference({ deviceId, requiredVRAM, pipeId, payload, res }) {
    let data;

    if (payload['stream']) {
        let i = 0;
        await unixSocketSend(unixSocketClients[deviceId].socket, { type: CALL_PIPE_REQUEST, pipeId, payload, requiredVRAM }, null, 60, (msg, resolve) => {
            const { type, ...restMSG } = msg;

            if (msg.done) {
                res.write('data: [DONE]' + '\n');
                res.end();
                resolve();
                return;
            } else {
                res.write('data: ' + JSON.stringify(restMSG) + '\n');
            }
            i++;
        })
        return;
    } else {
        data = await unixSocketSend(unixSocketClients[deviceId].socket, { type: CALL_PIPE_REQUEST, pipeId, payload, requiredVRAM });
    }

    if (data.filepath) {
        const filepath = data.filepath;
        const fileData = await readFile(filepath)
        fs.unlink(filepath, () => {})
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end(fileData, 'binary');
    } else if (data.text) {
        return res.status(200).json({ text: data.text });
    } else if (data.error) {
        return res.status(500).json({ error: data.error });
    }
}

async function handleRemoteInference({ deviceId, requiredVRAM, pipeId, payload, serverURL, res, privateKey }) {
    // Remote inference
    const options = {
        hostname: new URL(serverURL).hostname,
        port: new URL(serverURL).port,
        path: `/pipeCallFromRemoteServer/${pipeId}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': createServerToken(privateKey),
            'serverurl': process.env.CLUSTER_SERVER_URL
        },
    };

    const req = (serverURL.startsWith('https') ? https : http).request(options, (remoteRes) => {
        remoteRes.on('data', (chunk) => {
            res.write(chunk);
        });
        remoteRes.on('end', () => {
            res.end();
        });
    });

    req.on('error', (error) => {
        console.error(`problem with request: ${error.message}`);
    });

    req.write(JSON.stringify({ deviceId, requiredVRAM, ...payload }));
    req.end();
}

async function callBatchUpscale({
    deviceId, requiredVRAM, pipeId, payload, adminWSBroadcast, serversWSBroadcast, res, privateKey, transactionJWT, paymentRequired
}) {
    if (paymentRequired && !(await handlePayment({pipeId, payload, transactionJWT, res}))) return;
    let devices = findDevicesLoaded(pipeId);

    // Find the largest square number less than or equal to the length of the devices array
    let maxSquare = Math.floor(Math.sqrt(devices.length)) ** 2;

    // Limit the devices array to the largest square number
    devices = devices.slice(0, maxSquare);


    // single device handling
    if (!devices?.length || devices.length < 4) {
        return callPipeRequestHandler({ deviceId, requiredVRAM, pipeId, payload, adminWSBroadcast, serversWSBroadcast, res, privateKey });
    }

    function findBestDistribution(numTiles) {
        let cols = Math.ceil(Math.sqrt(numTiles));
        let rows = Math.ceil(numTiles / cols);

        // Adjust the columns if we can find a better fit
        while (numTiles % cols !== 0 && cols > 1) {
            cols--;
            rows = Math.ceil(numTiles / cols);
        }

        return { cols, rows };
    }

    const { rows, cols } = findBestDistribution(devices.length);

    payload.rows = rows;
    payload.cols = cols;

    // console.log({rows, cols});

    // Prepare all requests and execute them in parallel

    const requests = devices.map((device, index) => {
        const { serverURL, deviceId } = device;
        const tile_index = index; // Capture the current tile_index in a closure

        return new Promise((resolve, reject) => {
            try {
                const options = {
                    hostname: new URL(serverURL).hostname,
                    port: new URL(serverURL).port,
                    path: `/pipeCallFromRemoteServer/${pipeId}`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': createServerToken(privateKey),
                        'serverurl': process.env.CLUSTER_SERVER_URL
                    },
                };

                const req = (serverURL.startsWith('https') ? https : http).request(options, (remoteRes) => {
                    let chunks = [];
                    remoteRes.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    remoteRes.on('end', () => {
                        // Combine all the binary chunks into a single Buffer
                        const data = Buffer.concat(chunks);
                        resolve({tile_index, cols, rows, data});
                    });
                });

                req.on('error', (e) => {
                    reject(e);
                });

                req.write(JSON.stringify({
                    ...payload,
                    tile_index
                }));

                req.end();
            } catch (e) {
                reject(e);
            }
        });
    });

    try {
        // Wait for all requests to complete
        const responses = await Promise.all(requests);

        const imageBuffer = Buffer.isBuffer(responses[0].data)
            ? responses[0].data
            : Buffer.from(responses[0].data, 'binary');

        const tileMeta = await sharp(imageBuffer).metadata();

        const tileWidth = tileMeta.width;
        const tileHeight = tileMeta.height;
        const totalWidth = tileWidth * cols;
        const totalHeight = tileHeight * rows;

        // Create a blank canvas to place the tiles
        const canvas = sharp({
            create: {
                width: totalWidth,
                height: totalHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        });

        // Sort responses by tile_index to ensure correct order
        responses.sort((a, b) => a.tile_index - b.tile_index);

        // Composite the tiles onto the canvas
        const compositeImages = responses.map(response => {
            const tileRow = Math.floor(response.tile_index / cols);
            const tileCol = response.tile_index % cols;
            const leftOffset = tileCol * tileWidth;
            const topOffset = tileRow * tileHeight;

            const imageBuffer = Buffer.isBuffer(response.data)
                ? response.data
                : Buffer.from(response.data, 'binary');

            return {
                input: imageBuffer,
                left: leftOffset,
                top: topOffset
            };
        });

        const mergedImageBuffer = await canvas.composite(compositeImages).png().toBuffer();

        // Send the merged image to the client
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end(mergedImageBuffer, 'binary');

    } catch (error) {
        // Handle errors
        console.error('Error occurred while processing batch upscale:', error);
        res.status(500).send('An error occurred while processing your request.');
    }
}

const RESOURCE = {tokens: 'credits', bonusTokens: 'bonusTokens'}
async function handlePayment({pipeId, payload, transactionJWT, res}) {
    if (!Object.keys(models)?.length) return true; // no model prices defined -> allow models for free

    if (!models[pipeId]) return res.status(500).send({error: `Invalid pipeId ${pipeId}`}) && false;

    const {pricePerRequest, pricePerMinute, accountId, modelType} = models[pipeId];

    let amount = pricePerRequest || 0;

    let durationInSeconds;
    if (payload?.audio && pricePerMinute) {
        // default duration in case we are unable to detect it
        durationInSeconds = 5;

        // get duration
        try {
            const duration = await getAudioDuration(payload?.audio)

            if (duration > 1) {
                durationInSeconds = Math.round(duration);
                amount = Math.round((pricePerMinute/60) * durationInSeconds)
            } else {
                console.log('unable to get duration', duration)
            }

        } catch (e) {
            console.log('unable to get duration', e)
        }
    }

    // @Todo we have to implement refund on fail
    try {
        const {resourceId, toAccountId, maxAmount} = transactionJWT && decodeJWT(transactionJWT);
        if (!amount || !accountId) {
            return res.status(500).send({error: 'Models not configured for transactionJWT payment'}) && false;
        } else if (!transactionJWT) {
            return res.status(500).send({error: 'missing transaction token'}) && false;
        } else if (resourceId !== RESOURCE.tokens && resourceId !== RESOURCE.bonusTokens) {
            return res.status(500).send({error: `Invalid resourceId (expected: ${RESOURCE.tokens} or ${RESOURCE.bonusTokens})`}) && false
        } else if (toAccountId !== accountId) {
            return res.status(500).send({error: `Invalid accountId (expected: ${accountId})`}) && false
        } else if (maxAmount < amount) {
            return res.status(500).send({error: `Invalid maxAmount (expected: ${amount} or higher)`}) && false
        }

        let url = `https://ledger.openkbs.com/transfer?transactionJWT=${encodeURIComponent(transactionJWT)}` +
            `&requestedAmount=${amount}`;

        if (modelType === "voiceToText" && durationInSeconds) {
            url += `&requestedMessage=${encodeURIComponent('Speech recognition ' + durationInSeconds + ' seconds')}`
        } else if (modelType && ["generation", "inpaint", "upscale", "crop"]?.includes(modelType)) {
            url += `&requestedMessage=${encodeURIComponent('Image ' + modelType)}`
        }

        let [ledgerResponse] = await Promise.all([
            axios.get(url)
        ]);


        // console.log('ledgerResponse', ledgerResponse)

        if (!(ledgerResponse?.data?.success && accountId === ledgerResponse?.data?.toAccountId)) {
            res.status(500).send({error: 'transaction failed'});
        } else {
            // success
            return true;
        }

    } catch (err) {
        if (err?.response?.status === 499) {
            res.status(499).send({error: 'Unable to process transaction'});
        } else if (err?.response?.status && err?.response?.data) {
            res.status(err?.response?.status).send({...err?.response?.data});
        } else {
            res.status(500).send({error: 'transaction failed'});
        }
        if (err?.response?.data) console.log(err?.response?.data)
        return false;
    }
}

async function callPipeRequestHandler({ fromRemoteServer, deviceId, requiredVRAM, pipeId, payload,
    adminWSBroadcast, serversWSBroadcast, res, privateKey, transactionJWT, paymentRequired}) {

    if (paymentRequired && !(await handlePayment({pipeId, payload, transactionJWT, res}))) return;

    let serverURL = process.env.CLUSTER_SERVER_URL;

    if (!deviceId) {
        const result = await handleFindDevice(pipeId, res, fromRemoteServer);
        deviceId = result.deviceId;
        requiredVRAM = result.requiredVRAM;
        serverURL = result.serverURL;            
    } else if (requiredVRAM === undefined) {
        requiredVRAM = 0;
    }
    
    const queueItem = { pipeId, timeStarted: +new Date(), uuid: generateUUID() }

    if (serverURL === process.env.CLUSTER_SERVER_URL && unixSocketClients[deviceId]) {
        try {
            addQueueItem({ serverURL, deviceId, queueItem, adminWSBroadcast, serversWSBroadcast });
            const timeoutPromise = sleep(260000).then(() => { throw new Error('Timeout'); });
            await Promise.race([
                handleLocalInference({ deviceId, requiredVRAM, pipeId, payload, res }),
                timeoutPromise
            ]);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        } finally {

            removeQueueItem({ serverURL, deviceId, queueItem, adminWSBroadcast, serversWSBroadcast });
        }
    } else if (serverURL && serverURL !== process.env.CLUSTER_SERVER_URL) {
        try {
            addQueueItem({ serverURL, deviceId, queueItem });
            await handleRemoteInference({ deviceId, requiredVRAM, pipeId, payload, serverURL, res, privateKey });
        } catch (e) {
            return res.status(500).json({ error: e });
        } finally {
            removeQueueItem({ serverURL, deviceId, queueItem, adminWSBroadcast, serversWSBroadcast });
        }
    } else {
        return res.status(404).send({ error: 'Device not found' });
    }
}

module.exports = {
    applyPipeRoutes
}