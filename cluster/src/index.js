const port = process.env.BACKEND_PORT && parseInt(process.env.BACKEND_PORT) || 8080;
if (!process.env.CLUSTER_SERVER_URL) {
    process.env.CLUSTER_SERVER_URL = `http://localhost:${port}/`
} else if (process.env.CLUSTER_SERVER_URL && !process.env.CLUSTER_SERVER_URL.endsWith('/')) {
    // make sure always ends on /
    process.env.CLUSTER_SERVER_URL = process.env.CLUSTER_SERVER_URL + '/';
}

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const app = express();
app.use(express.json());
const si = require('systeminformation');
const { applyRoutes } = require('./app/routes');
const { unixSocketClients, unixSocketConnect, unixSocketSend} = require('./net/unixSocket');
const { spawnPythonWorker, getSMI} = require('./app/utils');
const { createServerConfig } = require('./db/serverConfig');
const { createServerUsers } = require('./db/serverUsers');
const { createServerConnections } = require('./db/serverConnections');
const { applyWSListeners, adminWSBroadcast, serversWSBroadcast } = require('./net/ws');
const { localStateUpdater } = require('./handlers/state');
const { connectServers } = require('./net/wsClients');
const { listenServer } = require('./net/server');
const {LOAD_PIPE_REQUEST} = require("./constants");
if (!fs.existsSync('leveldb')) fs.mkdirSync('leveldb');
if (!fs.existsSync('images')) fs.mkdirSync('images');
if (!fs.existsSync('tmp_images')) fs.mkdirSync('tmp_images');

// si.cpuTemperature()
//   .then(data => console.log(data))
//   .catch(error => console.error(error));

// CLUSTER_DEVICES_MAP=[[0,1,2,3,4,5,6]]
let clusterDevicesMap = process.env['CLUSTER_DEVICES_MAP']

// PRELOAD_MODELS=PRELOAD_MODELS=[['stabilityai--stable-diffusion-x4-upscaler--default',1], ['stabilityai--stable-diffusion-x4-upscaler--default',1], ['stabilityai--stable-diffusion-x4-upscaler--default',1], ['stabilityai--stable-diffusion-x4-upscaler--default',1], ['stabilityai--stable-diffusion-x4-upscaler--default',1], ['stabilityai--stable-diffusion-x4-upscaler--default',1], ['stabilityai--stable-diffusion-x4-upscaler--default',1], ['stabilityai--stable-diffusion-x4-upscaler--default',1]]
// PRELOAD_MODELS=PRELOAD_MODELS=[['meta-llama--phi-2--default',1], ['meta-llama--Meta-Llama-3-8B--default',1], ['meta-llama--Meta-Llama-3-70B-Instruct--default',1]]
let preloadModels = process.env['PRELOAD_MODELS']


if (clusterDevicesMap) {
    clusterDevicesMap = JSON.parse(clusterDevicesMap);
    clusterDevicesMap = clusterDevicesMap.map(o => o.toString())
}

try {
    if (preloadModels) preloadModels = JSON.parse(preloadModels);
} catch (error) {
    console.error("Error parsing preloadModels:", error);
    console.log("preloadModels content:", preloadModels);
}

console.log('preloadModels', preloadModels)

console.log('devicesArg', clusterDevicesMap)

// Function to spawn a Python subprocess with a specific device ID
let systemDevices;

(async () => {
    const serverConfig = await createServerConfig();
    console.log('serverConfig Loaded')
    const serverUsers = await createServerUsers();
    console.log('serverUsers Loaded')
    const serverConnections = await createServerConnections();
    console.log('serverConnections Loaded')

    // utilization_gpu: '0', utilization_memory: '0'
    systemDevices = clusterDevicesMap ? clusterDevicesMap : (await getSMI()).map(o => o.index);

    console.log(`Devices found ${JSON.stringify(systemDevices)}`);

    const devicesToConnect = []
    for (let CUDA_VISIBLE_DEVICES of systemDevices) {
        try {
            const python = await spawnPythonWorker(CUDA_VISIBLE_DEVICES);
            devicesToConnect.push(CUDA_VISIBLE_DEVICES);
            // You can use the `python` object here to interact with the subprocess
        } catch (err) {
            console.error(`Failed to spawn Python subprocess with CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES}`, err);
        }
    }

    // connect devices
    for (let CUDA_VISIBLE_DEVICES of devicesToConnect) {
        unixSocketClients[CUDA_VISIBLE_DEVICES] = {
            disabled: false,
            frozen: false,
            socket: await unixSocketConnect(CUDA_VISIBLE_DEVICES),
            socket2: await unixSocketConnect(CUDA_VISIBLE_DEVICES, false, '2')
        };
    }

    localStateUpdater({adminWSBroadcast, serversWSBroadcast});

    if (preloadModels) {
        const sendPromises = []; // Array to hold all the promises
        let i = 0;
        for (let [pipeId, frozen] of preloadModels) {
            const deviceId = systemDevices[i];
            if (unixSocketClients[deviceId]) {
                // Push the promise returned by unixSocketSend into the array
                sendPromises.push(unixSocketSend(unixSocketClients[deviceId].socket, {
                    type: LOAD_PIPE_REQUEST,
                    pipeId
                }));

                if (frozen) unixSocketClients[deviceId].frozen = true;
            }
            i++;
        }

        // Wait for all the promises to resolve
        await Promise.all(sendPromises);
    }

    // CORS middleware
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, transaction-jwt');
        if (req.method === 'OPTIONS') {
            res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
            return res.status(200).json({});
        }
        next();
    });

    applyRoutes({ app, serverConfig, serverUsers, serverConnections, adminWSBroadcast, serversWSBroadcast });

    const server = http.createServer(app);
    const wss = new WebSocket.Server({ server, maxPayload: 1024**3 });    

    applyWSListeners({ wss, serverConfig, serverConnections });

    await listenServer(server, port);

    const serverSuccessfullyConnected = await connectServers({
        serverConnections, 
        privateKey: serverConfig.data.privateKey, 
        adminWSBroadcast
    })

})()

