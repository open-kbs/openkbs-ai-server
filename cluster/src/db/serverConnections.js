
const { Level } = require('level');

let serverConnections;


function createServerConnections() {
    return new Promise((resolve) => {
        serverConnections = new Level('./leveldb/serverConnections', { valueEncoding: 'json' })
        serverConnections.data = {};
    
        serverConnections.on('put', function (key, value) {
            serverConnections.data[key] = value;
        })
    
        serverConnections.on('del', function (key, value) {        
            delete serverConnections.data[key];
        })
    
        serverConnections.on('ready', async function (key, value) {
            for await (const [key, value] of serverConnections.iterator()) serverConnections.data[key]= value;
            resolve(serverConnections)
        })    
    });
}

module.exports = {
    createServerConnections
}