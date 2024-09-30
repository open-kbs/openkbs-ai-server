const { listModels, pipesMap } = require('../models');
const jsondiffpatch = require('jsondiffpatch');
const { getDevices } = require('./devices');
const { sleep } = require('../app/utils');
const {deepCopy} = require("../utils");

let state = {
    [process.env.CLUSTER_SERVER_URL]: {}
}


function deleteServerState(url, adminWSBroadcast) {
    // Check if the state for the given URL exists
    if (state.hasOwnProperty(url)) {
        let newState = deepCopy(state);
        delete newState[url];
        let delta = jsondiffpatch.diff(state, newState);
        delete state[url];
        // Broadcast the deletion to all connected admin clients
        adminWSBroadcast({ 'type': 'PATCH_STATE', delta });
    }
}

// remote server state loaded
function initServerState(url, adminWSBroadcast, newState) {        
    state[url] = newState[url];
    let delta = jsondiffpatch.diff(state, newState);    
    adminWSBroadcast({'type': 'PATCH_STATE', delta});
}

// remote server state changed
function patchServerState(url, adminWSBroadcast, delta) {
    jsondiffpatch.patch(state[url], delta[url]);
    adminWSBroadcast({'type': 'PATCH_STATE', delta});
}

function updateStateLocal(delta, adminWSBroadcast, serversWSBroadcast) {
    jsondiffpatch.patch(state[process.env.CLUSTER_SERVER_URL], delta[process.env.CLUSTER_SERVER_URL]);
    adminWSBroadcast({'type': 'PATCH_STATE', delta});
    serversWSBroadcast({'type': 'PATCH_STATE', delta});
}

function updateState({delta, adminWSBroadcast, serversWSBroadcast}) {
    jsondiffpatch.patch(state, delta);
    if (adminWSBroadcast) adminWSBroadcast({'type': 'PATCH_STATE', delta});
    if (serversWSBroadcast) serversWSBroadcast({'type': 'PATCH_STATE', delta});
}

let debug = false;
function setDebug(bool) {
    debug = bool;
}
const logDebug = (...data) => {
    if (debug) console.log(...data)
}
async function localStateUpdater({adminWSBroadcast, serversWSBroadcast}) {
    while (true) {
        const newLocalState = await fetchLocalState();
        logDebug('newLocalState', newLocalState)
        const newState = {
            ...state,
            [process.env.CLUSTER_SERVER_URL]: newLocalState
        }

        let delta = jsondiffpatch.diff(state, newState);
        logDebug('delta', delta)
        if (delta) updateStateLocal(delta, adminWSBroadcast, serversWSBroadcast)

        await sleep(200);
    }
}

function getState(key = null) {
    return key ? state?.[key] : state;
}

async function fetchLocalState() {
    const [devices, { models }] = await Promise.all([getDevices({fetchSmiEveryX: 2, state}), listModels({fetchModelsEveryX: 4})]);
    logDebug('devices.gpus', devices?.map(o => o.gpus))
    function processData(data) {
        // Iterate over each model
        for (let vendor in data.models) {
            for (let model in data.models[vendor]) {
                // Check if the model is installed
                if (data.models[vendor]?.[model].status === "INSTALLED") {
                    // Add isAvailable to the pipe
                    for (let suffix in data.pipesMap?.[vendor]?.[model]) {
                        data.pipesMap[vendor][model][suffix].isAvailable = true;
                    }
                }
            }
        }

        // Iterate over each device
        data.devices.forEach(device => {
            // Iterate over each pipe in the device
            device.pipes.forEach(pipe => {
                // Split the pipe string to get vendor, model and suffix
                const [vendor, model, suffix] = pipe.split('--');

                // Add loadedOn to the pipe
                if (data.pipesMap[vendor] && data.pipesMap[vendor][model] && data.pipesMap[vendor][model][suffix]) {
                    if (data.pipesMap[vendor][model][suffix].loadedOnDevice) {
                        // Check if the deviceId is already in the array
                        if (!data.pipesMap[vendor][model][suffix].loadedOnDevice.includes(device.deviceId)) {
                            data.pipesMap[vendor][model][suffix].loadedOnDevice.push(device.deviceId);
                        }
                    } else {
                        data.pipesMap[vendor][model][suffix].loadedOnDevice = [device.deviceId];
                    }
                }
            });
        });

        return data;
    }

    const localState = processData({
        devices,
        models,
        pipesMap
    });

    logDebug('localState', localState)

    return localState;
}

module.exports = {
    setDebug,
    getState,
    updateState,
    localStateUpdater,
    initServerState,
    patchServerState,
    deleteServerState
}