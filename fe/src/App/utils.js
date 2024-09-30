import sha256 from "crypto-js/sha256";
export const isMobile = window.innerWidth < 960;
export const is_localhost = window.location.href.startsWith('http://localhost');

export function sleep (time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

export const stateToArray = state => Object.keys(state).map(url => ({url, ...state[url]}));

export function calcUsageTotal(clusterArray) {
    let total_memory_total = 0;
    let total_memory_used = 0;
    let total_power_draw = 0;
    let total_power_limit = 0;
    let total_queue_tasks = 0;

    clusterArray.forEach(cluster => {
        cluster?.devices?.forEach(device => {
            if (device?.queue) total_queue_tasks += device.queue.length

            device?.gpus.forEach(gpu => {
                total_memory_total += parseInt(gpu.memory_total, 10);
                total_memory_used += parseInt(gpu.memory_used, 10);
                total_power_draw += parseFloat(gpu.power_draw);
                total_power_limit += parseFloat(gpu.power_limit);
            });
        });
    });

    return {
        total_memory_total,
        total_memory_used,
        total_power_draw,
        total_power_limit,
        total_queue_tasks
    };
}


function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

export function convertHexToRgba(hex, opacity) {
    let rgb = hexToRgb(hex);
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`;
}

export function parseJSON(str) {
    if (!str || !str.startsWith('{') && !str.startsWith('[')) return;
    try {
        return JSON.parse(str);
    } catch (e) {
        return;
    }
}
