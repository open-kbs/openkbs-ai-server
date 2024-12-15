
const { Level } = require('level');
const { createWallet } = require('../crypto/crypto');

let serverConfig;


function createServerConfig() {
    return new Promise((resolve) => {

        serverConfig = new Level('./leveldb/serverConfig', { valueEncoding: 'json' })

        serverConfig.data = {};
    
        serverConfig.on('put', function (key, value) {
            serverConfig.data[key] = value;
        })
        serverConfig.on('del', function (key, value) {        
            delete serverConfig.data[key];
        })
    
        serverConfig.on('ready', async function (key, value) {
            let accountId;
    
            try {
                accountId = await serverConfig.get('accountId');
            } catch (e) {
                const wallet = createWallet();
        
                await serverConfig.put('accountId', wallet.accountId)
                await serverConfig.put('privateKey', wallet.privateKey)
                await serverConfig.put('publicKey', wallet.publicKey)
                accountId = wallet.accountId;
            }
        
            serverConfig.data.accountId = accountId
            serverConfig.data.privateKey = await serverConfig.get('privateKey');
            serverConfig.data.publicKey = await serverConfig.get('publicKey');

            resolve(serverConfig)
        })

    })
}

module.exports = {
    createServerConfig
}