const listenServer = (server, port) => {
    return new Promise((resolve, reject) => {
        server.listen(port, (err) => {
            if (err) {
                reject(err);
            } else {
                console.log(`Server and WebSocket listening on port ${port}`);
                resolve();
            }
        });
    });
};

module.exports = {
    listenServer
}