const { getDevices, callPipeRequestHandler } = require("../handlers/devices");
const { getState, setDebug} = require("../handlers/state");
const { listModels, installModel, uninstallModel, isInstallationInProgress } = require('../models');


const v8 = require('v8');
const { unixSocketClients, unixSocketSend } = require("../net/unixSocket");
const { LOAD_PIPE_REQUEST, DELETE_PIPE_REQUEST } = require("../constants");
const { auth, authFromRemoteServer } = require("./auth");
const { sha256, getGPUType, killPythonWorker} = require("./utils");
const { signPayload, toPrivateKeyObject } = require("../crypto/crypto");
const { applyServerConnectionsRoutes } = require("./serverConnections");
const { setFanSpeed, resetFanSpeed, setPowerLimit, getPowerReadings } = require("../handlers/nvidiaSettings");
const { applyPipeRoutes } = require("./pipe");

const heapStatistics = v8.getHeapStatistics();
const heap_size_limit = heapStatistics.heap_size_limit;

function onlyLocalhost(req, res, next) {
    const ip = req.connection.remoteAddress;
    if (!process.env.ALLOW_REMOTE_REGISTRATION && ip !== '127.0.0.1' && ip !== '::1') {
        return res.status(403).send({ error: 'Only localhost requests are allowed. Run the server with ALLOW_REMOTE_REGISTRATION env variable to allow registration.' });
    }
    next();
}

function applyRoutes({ app, serverConfig, serverUsers, serverConnections, adminWSBroadcast, serversWSBroadcast }) {

    const { accountId, publicKey, privateKey } = serverConfig.data;
    const Auth = auth(publicKey, serverUsers.data);
    const AuthFromServer = authFromRemoteServer(serverConnections);

    applyServerConnectionsRoutes({ app, serverConnections, Auth, adminWSBroadcast });

    applyPipeRoutes({app, Auth, AuthFromServer, privateKey, adminWSBroadcast, serversWSBroadcast});

    app.get('/resetPowerLimit/:gpu', Auth, async (req, res) => {
        try {
            const gpu = parseInt(req.params.gpu);
            const { defaultPowerLimit } = await getPowerReadings(gpu);
            const response = await setPowerLimit(gpu, defaultPowerLimit);
            res.status(200).send({ response });
        } catch (e) {
            res.status(500).send({ error: 'resetPowerLimit Failed', details: e.message });
        }
    });

    app.get('/setPowerLimit/:gpu/:watts', Auth, async (req, res) => {
        try {
            const gpu = parseInt(req.params.gpu);
            const watts = parseFloat(req.params.watts); // Power limit might be a decimal
            const response = await setPowerLimit(gpu, watts);
            res.status(200).send({ response });
        } catch (e) {
            res.status(500).send({ error: 'setPowerLimit Failed', details: e.message });
        }
    });

    app.get('/debugon', Auth, async (req, res) => {
        setDebug(true);
        res.status(200).send({ debug:true });
    });

    app.get('/debugoff', Auth, async (req, res) => {
        setDebug(false);
        res.status(200).send({ debug: false });
    });

    const powerReadings = {};
    app.get('/getPowerReadings', Auth, async (req, res) => {

        if (getGPUType() === 'AMD') {
            // @Todo
            return res.status(200).send({  });
        }
        try {
            if (Object.keys(powerReadings).length) return res.status(200).send(powerReadings);

            const devices = await getDevices();

            for (const device of devices) {
                for (const gpu of device.gpus) {
                    powerReadings[gpu.index] = await getPowerReadings(parseInt(gpu.index));
                }
            }

            return res.status(200).send(powerReadings);

        } catch (e) {
            res.status(500).send({ error: 'getPowerReadings Failed', details: e.message });
        }
    });


    app.get('/resetFanSpeed/:gpu', Auth, async (req, res) => {
        try {
            const response = await resetFanSpeed(parseInt(req.params.gpu))
            res.status(200).send({ response });
        } catch (e) {
            res.status(200).send({ error: 'resetFanSpeed Failed' });
        }
    });

    app.get('/setFanSpeed/:gpu/:speed', Auth, async (req, res) => {
        try {
            const response = await setFanSpeed(parseInt(req.params.gpu), parseInt(req.params.speed))
            res.status(200).send({ response });
        } catch (e) {
            res.status(200).send({ error: 'setFanSpeed Failed' });
        }
    });

    app.get('/public', async (req, res) => {
        res.status(200).send({ publicKey, accountId });
    });

    app.post('/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const usernameFromDB = await serverUsers.get(username);

            if (username && password && sha256(password) === usernameFromDB.password) {
                let payload = { username };
                if (usernameFromDB.fullPermissions) payload.fullPermissions = true;
                const token = signPayload(payload, toPrivateKeyObject(privateKey));
                res.status(200).send({ token });
            } else {
                res.status(200).send({ error: 'invalid username or password' });
            }
        } catch (e) {
            res.status(200).send({ error: 'Failed' });
        }

    });

    app.post('/registerUser', Auth, onlyLocalhost, async (req, res) => {
        const { username, password, fullPermissions, endpoints } = req.body;
        await serverUsers.put(username, { password: sha256(password), fullPermissions, endpoints });
        res.status(200).send({ registered: true });
    });

    app.get('/heap_size_limit', Auth, async (req, res) => {
        res.status(200).send({ heap_size_limit });
    });

    app.get('/disable/:deviceId', Auth, async (req, res) => {
        if (!unixSocketClients[req?.params?.deviceId]) {
            res.status(500).send({ error: 'Device not found', availableDevices: Object.keys(unixSocketClients) });
        } else {
            unixSocketClients[req?.params?.deviceId].disabled = true;
            res.status(200).send({ disabled: true });
        }

    });

    app.get('/restartDevice/:deviceId', Auth, async (req, res) => {
        killPythonWorker(req?.params?.deviceId)
        res.status(200).send({ restarted: req?.params?.deviceId });
    });

    app.get('/enable/:deviceId', Auth, async (req, res) => {
        delete unixSocketClients[req?.params?.deviceId].disabled;
        res.status(200).send({ disabled: false });
    });

    app.get('/freez/:deviceId', Auth, async (req, res) => {
        if (!unixSocketClients[req?.params?.deviceId]) {
            res.status(500).send({ error: 'Device not found', availableDevices: Object.keys(unixSocketClients) });
        } else {
            unixSocketClients[req?.params?.deviceId].frozen = true;
            res.status(200).send({ frozen: true });
        }

    });

    app.get('/unfreez/:deviceId', Auth, async (req, res) => {
        delete unixSocketClients[req?.params?.deviceId].frozen;
        res.status(200).send({ frozen: false });
    });

    app.get('/load/:deviceId/:pipeId/', Auth, async (req, res) => {
        const { pipeId, deviceId } = req.params;
        if (!unixSocketClients[deviceId]) return res.status(404).send({ error: 'Non existing device' });

        let data;
        if (req.query.async) {
            unixSocketSend(unixSocketClients[deviceId].socket, {
                type: LOAD_PIPE_REQUEST,
                pipeId
            })
            data = ({ msg: 'Load process started.', status: 200 });
        } else {
            data = await unixSocketSend(unixSocketClients[deviceId].socket, {
                type: LOAD_PIPE_REQUEST,
                pipeId
            })
        }

        res.status(200).send(data);
    });

    app.get('/delete_pipe/:deviceId/:pipeId/', Auth, async (req, res) => {
        const { pipeId, deviceId } = req.params;
        const data = await unixSocketSend(unixSocketClients[deviceId].socket, { type: DELETE_PIPE_REQUEST, pipeId })

        res.status(200).send(data);
    });

    app.get('/state', Auth, async (req, res) => {
        const state = getState();
        res.status(200).send(state);
    });

    app.get('/devices', Auth, async (req, res) => {
        const devices = await getDevices();
        res.status(200).send(devices);
    });

    app.get('/models', Auth, async (req, res) => {
        const { status, ...data } = await listModels();
        res.status(status).send(data);
    });

    app.get('/install/:vendor/:model', Auth, async (req, res) => {
        const { vendor, model } = req.params;

        if (isInstallationInProgress(vendor, model)) {
            res.status(200).send({ msg: 'inProgress' });
            return;
        }

        const { status, ...data } = await installModel(vendor, model)
        res.status(status).send(data);
    });

    app.get('/uninstall/:vendor/:model', Auth, async (req, res) => {
        const { vendor, model } = req.params;
        const { status, ...data } = await uninstallModel(vendor, model)
        res.status(status).send(data);
    });
}

module.exports = {
    applyRoutes
}