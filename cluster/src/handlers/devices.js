const { GET_PIPES_REQUEST } = require('../constants');
const { unixSocketBroadcast, unixSocketClients } = require('../net/unixSocket');
const { getSMI } = require('../app/utils');

let getDevicesRequestId = 0;
let nvidiaSmiCache = null;

async function getDevices(props) {
    getDevicesRequestId++;
    let pipesData;
    let nvidiaSmi;

    const x = props?.fetchSmiEveryX;
    if (x && nvidiaSmiCache !== null && getDevicesRequestId % x !== 0) {
        pipesData = await unixSocketBroadcast({ type: GET_PIPES_REQUEST }, '2');
        nvidiaSmi = nvidiaSmiCache;
    } else {
        [pipesData, nvidiaSmi] = await Promise.all([
            unixSocketBroadcast({ type: GET_PIPES_REQUEST }, '2'),
            getSMI()
        ]);
    }

    nvidiaSmiCache = nvidiaSmi

    const devices = pipesData.map((o) => {
        const { uuid, type, CUDA_VISIBLE_DEVICES, ...restPipesData } = o;

        const gpus = nvidiaSmi.filter(smiDevice => CUDA_VISIBLE_DEVICES.split(',').map(device => device.trim()).includes(smiDevice.index)
        )

        const prevQueue = props?.state?.[process.env.CLUSTER_SERVER_URL]?.devices
        ?.find(device => device.deviceId === CUDA_VISIBLE_DEVICES)?.queue;

        return {
            deviceId: CUDA_VISIBLE_DEVICES,
            frozen: unixSocketClients?.[CUDA_VISIBLE_DEVICES]?.frozen ? true : false,
            disabled: unixSocketClients?.[CUDA_VISIBLE_DEVICES]?.disabled ? true : false,
            queue: prevQueue ? prevQueue : [],
            ...restPipesData,
            gpus
        };
    });

    return devices;
}



module.exports = {
    getDevices
}