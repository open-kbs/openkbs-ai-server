
const { Level } = require('level');
const { createWallet } = require('../crypto/crypto');

let serverUsers;


function createServerUsers() {
    return new Promise((resolve) => {
        serverUsers = new Level('./leveldb/serverUsers', { valueEncoding: 'json' })
        serverUsers.data = {};
    
        serverUsers.on('put', function (key, value) {
            serverUsers.data[key] = value;
        })
    
        serverUsers.on('del', function (key, value) {        
            delete serverUsers.data[key];
        })
    
        serverUsers.on('ready', async function (key, value) {
            for await (const [key, value] of serverUsers.iterator()) serverUsers.data[key]= value;
            resolve(serverUsers)
        })
    });
}

module.exports = {
    createServerUsers
}