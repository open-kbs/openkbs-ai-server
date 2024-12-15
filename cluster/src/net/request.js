const http = require('http');
const https = require('https');

function makeRequest(url, method = 'GET', jsonData) {
    // Choose the right module based on the URL
    const protocol = url.startsWith('https') ? https : http;

    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    return new Promise((resolve, reject) => {
        const req = protocol.request(url, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve(data);
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (jsonData) {
            req.write(JSON.stringify(jsonData));
        }

        req.end();
    });
}

module.exports = {
    makeRequest
}