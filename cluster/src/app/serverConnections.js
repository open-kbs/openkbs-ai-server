const { connectionStatus } = require("../constants");
const { makeRequest } = require("../net/request");

function applyServerConnectionsRoutes({app, serverConnections, Auth, adminWSBroadcast}) {
    app.get('/serverConnections', Auth, async (req, res) => {
        res.status(200).send(Object.keys(serverConnections.data).map(url => ({url, ...serverConnections.data[url]})));
    });

    app.post('/grantConnection', Auth, async (req, res) => {
        let { url } = req.body;
        const connection = await serverConnections.get(url);
        await serverConnections.put(url, {...connection, status: connectionStatus.GRANTED});    
        // @Todo to connectServers on new connection
        return res.status(200).send({success: true});
    });

    app.post('/removeConnection', Auth, async (req, res) => {
        let { url } = req.body;

        try {
            // Check if the connection exists
            const connection = await serverConnections.get(url);
            if (!connection) {
                return res.status(404).send({ success: false, message: 'Connection not found' });
            }

            // Remove the connection
            await serverConnections.del(url);

            // Respond with success
            return res.status(200).send({ success: true, message: 'Connection removed successfully' });
        } catch (error) {
            // Handle any errors that occur during the process
            console.error('Error removing connection:', error);
            return res.status(500).send({ success: false, message: 'Internal server error' });
        }
    });

    app.get('/restartServer', Auth, async (req, res) => {
        process.exit();
    });

    app.post('/rejectConnection', Auth, async (req, res) => {
        let { url } = req.body;
        await serverConnections.del(url);
        return res.status(200).send({success: true});
    });

    app.post('/requestConnectionHandler', async (req, res) => {
        let { url, permissionRequested } = req.body;   

        try {            
            if (await serverConnections.get(url)) {
                return res.status(500).send({error: 'Connection already requested'});
            }
        } catch (e) {
            if (e?.message?.startsWith('NotFound')) {                
                console.error('New requested connection received');
            } else {
                console.error(e.message);
            }
        }

        try {                        
            const {publicKey} = JSON.parse(await makeRequest(url + `public`));
        
            if (publicKey) {
                const payload = { status: connectionStatus.REQUESTED, publicKey, permissions: permissionRequested };                
                await serverConnections.put(url, payload);
                adminWSBroadcast({'type': 'NEW_CONNECTION_REQUEST', connection: payload, url });
                return res.status(200).send({success: true});
            } else {
                return res.status(500).send({error: 'Unable to fetch requesting server public key'});
            }
        } catch (e) {
            res.status(500).send({error: e.message});
        }
    });

    app.post('/requestConnection', async (req, res) => {
        let { url, remoteUrl, permissionGranted, permissionRequested } = req.body;
        remoteUrl = remoteUrl?.endsWith('/') ? remoteUrl : remoteUrl + '/';

        try {
            const {publicKey} = JSON.parse(await makeRequest(remoteUrl + `public`));
            const payload = { status: connectionStatus.GRANTED, publicKey, permissions: permissionGranted };
            await serverConnections.put(remoteUrl, payload);
        } catch (e) {
            return res.status(500).send({error: 'Unable to fetch remote server public key'});
        }

        try {
            const connectionResponse = JSON.parse(await makeRequest(
                remoteUrl + `requestConnectionHandler`, 'POST', { url, permissionGranted, permissionRequested }
            ));

            return res.status(connectionResponse?.error ? 500 : 200).send(connectionResponse);
            
        } catch (e) {
            res.status(500).send({error: e.message});
        }
    });
}

module.exports = {
    applyServerConnectionsRoutes
}