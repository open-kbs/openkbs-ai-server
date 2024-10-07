const { toPublicKeyObject, verify } = require("../crypto/crypto");

function authFromRemoteServer(serverConnections) {
    return (req, res, next) => {
        let token = req.headers['authorization'] || req.headers['Authorization'];
        let serverURL = req.headers['serverurl'];

        if (!serverURL) {
            return res.status(401).send({ auth: false, message: 'No serverURL provided' });
        }

        const serverState = serverConnections?.data?.[serverURL];

        // internal call
        if (serverURL === process.env.CLUSTER_SERVER_URL) {
            next();
            return;
        }

        if (!serverState || serverState?.status !== 'GRANTED' || !serverState?.publicKey) {
            return res.status(401).send({ auth: false, message: 'Server not authorized to connect' });
        }

        const publicKey = serverState?.publicKey
        
        if (!token) {
            return res.status(401).send({ auth: false, message: 'No token provided.' });
        }

        verify(token, toPublicKeyObject(publicKey))
            .then(decoded => {
                req.session = decoded;
                if (decoded.fullPermissions || decoded?.endpoints?.includes(req.route.path)) {
                    next();
                } else {
                    return res.status(403).send({ auth: false, message: 'Access denied to ' + req.route.path });
                }
                
            })
            .catch(err => {
                return res.status(401).send({ auth: false, message: 'Invalid token provided.' });
            });
    }
}

function auth(publicKey, serverUsers) {
    return (req, res, next) => {
        let token = req.headers['authorization'] || req.headers['Authorization'] || req.query.token;

        const hasUsers = Object.keys(serverUsers).length;

        // allow registerUser if no users
        if (!hasUsers && req.route.path.endsWith('registerUser')) {
            return next();
        }

        if (!hasUsers) {
            return res.status(409).send({ message: 'No registered users' });
        }

        // Determine the original client IP address
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

        // Check if the request is from localhost
        const isLocalhost = (clientIp === '127.0.0.1' || // IPv4 localhost
            clientIp === '::1' ||       // IPv6 localhost
            clientIp === '0:0:0:0:0:0:0:1' || // Full IPv6 localhost
            clientIp === '::ffff:127.0.0.1'); // IPv4-mapped IPv6 localhost


        // Ensure that your reverse proxy is configured to set the X-Forwarded-For header
        // and that your application trusts this header only from known proxies.
        if (isLocalhost) {
            return next();
        }

        if (!token) {
            return res.status(401).send({ auth: false, message: 'No token provided.' });
        }

        // If the token includes 'Bearer', remove it
        if (token?.startsWith?.('Bearer ')) {
            token = token.slice(7, token.length);
        }

        verify(token, toPublicKeyObject(publicKey))
            .then(decoded => {
                req.session = decoded;
                if (decoded.fullPermissions || decoded?.endpoints?.includes(req.route.path)) {
                    next();
                } else {
                    return res.status(403).send({ auth: false, message: 'Access denied to ' + req.route.path });
                }

            })
            .catch(err => {
                return res.status(401).send({ auth: false, message: 'Invalid token provided.' });
            });
    }
}

module.exports = {
    auth,
    authFromRemoteServer
};
