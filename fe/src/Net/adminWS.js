import { parseJSON } from "../App/utils";

let ws;
let reconnectInterval = 1000; // start with 1 second
const maxReconnectInterval = 30000; // max 30 seconds
let reconnectTimeoutId = null;
let lastReceivedMessage = +new Date();
const maxAcceptableHeartbeatInterval = 15000;

function reconnect(adminWSURL, callbacks) {
    if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);

    reconnectTimeoutId = setTimeout(() => {
        initAdminWS(adminWSURL, callbacks);
        reconnectInterval *= 2;

        if (reconnectInterval > maxReconnectInterval) {
            reconnectInterval = maxReconnectInterval;
        }

    }, reconnectInterval);
}

let intervalId = null;

export function initAdminWS(adminWSURL, callbacks) {
    const token = localStorage.getItem('userToken');
    ws = new WebSocket(adminWSURL + '?token=' + encodeURIComponent(token));

    ws.onopen = function (e) {
        reconnectInterval = 1000;
        lastReceivedMessage = +new Date()

        if (intervalId) clearInterval(intervalId);
        
        intervalId = setInterval(() => {
            if (+new Date() - lastReceivedMessage > maxAcceptableHeartbeatInterval) {
                console.log('maxAcceptableHeartbeatInterval exceeded reconnecting')
                reconnect(adminWSURL, callbacks);
            }
        }, 5000);
    };

    ws.onclose = function (event) {
        callbacks.ON_CLOSE();
        reconnect(adminWSURL, callbacks);
    };

    ws.onmessage = function (event) {
        const data = parseJSON(event.data)
        if (data !== undefined) {
            lastReceivedMessage = +new Date()

            if (data?.type && callbacks?.[data?.type]) {
                callbacks[data.type](data);
            }
        }
    };
}