const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const generateTransactionId = () => `${+new Date()}-${Math.floor(100000 + Math.random() * 900000)}`; // Timestamp in ms and a 6-digit random number

function publicKeyToAccountId(publicKeyBase64) {
    return crypto.createHash('sha256').update(publicKeyBase64).digest('hex').substring(0, 32);
}

function toPrivateKeyObject(privateKeyString) {
    return crypto.createPrivateKey({
        key: Buffer.from(privateKeyString, 'base64'),
        format: 'der',
        type: 'pkcs8'
    })
}

function toPublicKeyObject(publicKeyString) {
    return crypto.createPublicKey({
        key: Buffer.from(publicKeyString, 'base64'),
        format: 'der',
        type: 'spki'
    });
}

function verify(token, publicKeyObj) {
    return new Promise((resolve, reject) => {
        jwt.verify(token, publicKeyObj, { algorithms: ['ES256'] }, (err, decoded) => {
            if (err) {
                console.error('JWT Verification Error:', err);
                reject(err);
            } else {
                resolve(decoded);
            }
        });
    });
}

function createWallet() {
    // Generate ECDSA keys using P-256
    const {publicKey, privateKey} = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',  // P-256
        publicKeyEncoding: {
            type: 'spki',
            format: 'der'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'der'
        }
    });

    // Create SHA-256 hash of the public key
    const accountId = publicKeyToAccountId(publicKey.toString('base64'));

    return {
        accountId,
        publicKey: (publicKey.toString('base64')),
        privateKey: (privateKey.toString('base64'))
    }
}

function signPayload(payload, privateKey, expiresIn = 1000 * 60 * 60 * 24) {
    // Sign JWT
    try {
        const token = jwt.sign(payload, privateKey, {
            algorithm: 'ES256',
            header: {
                alg: 'ES256',
                typ: 'JWT',
            },
            expiresIn
        });

        return token;
    } catch (error) {
        console.error('JWT Signing Error:', error);
    }
}

module.exports = {
    createWallet,
    signPayload,
    toPublicKeyObject,
    toPrivateKeyObject,
    verify,
    publicKeyToAccountId
}