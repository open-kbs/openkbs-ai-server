function processWithThresholds(delta, thresholds) {
    if (delta && delta.devices && delta.devices[0] && delta.devices[0].gpus && delta.devices[0].gpus[0]) {
        const device = delta.devices[0].gpus[0];
        for (let key in thresholds) {
            if (device[key] && Math.abs(Number(device[key][0]) - Number(device[key][1])) < thresholds[key]) {
                delete device[key];
            }
        }
        if (Object.keys(device).length === 1 && device._t) {
            delete device._t;
        }
        if (Object.keys(device).length === 0) {
            delete delta.devices[0].gpus[0];
        }
        if (Object.keys(delta.devices[0].gpus).length === 1 && delta.devices[0].gpus._t) {
            delete delta.devices[0].gpus._t;
        }
        if (Object.keys(delta.devices[0].gpus).length === 0) {
            delete delta.devices[0].gpus;
        }
        if (Object.keys(delta.devices[0]).length === 1 && delta.devices[0]._t) {
            delete delta.devices[0]._t;
        }
        if (Object.keys(delta.devices[0]).length === 0) {
            delete delta.devices[0];
        }
        if (Object.keys(delta.devices).length === 1 && delta.devices._t) {
            delete delta.devices._t;
        }
        if (Object.keys(delta.devices).length === 0) {
            delete delta.devices;
        }
    }
    return delta && Object.keys(delta).length === 0 ? undefined : delta;    
}

module.exports = {
    processWithThresholds
}