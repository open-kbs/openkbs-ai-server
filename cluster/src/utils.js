const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const https = require('https');
const path = require('path');
const os = require('os');

// Function to download file
const downloadFile = (url, filePath) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        https.get(url, function(response) {
            response.pipe(file);
            file.on('finish', function() {
                file.close(() => resolve(filePath));
            });
        }).on('error', function(err) {
            fs.unlink(filePath, () => reject(err.message));
        });
    });
};

// Function to get audio duration
const getAudioDuration = (url) => {
    return new Promise((resolve, reject) => {
        // Generate a temporary file path for the original file
        const tempFilePath = path.join(os.tmpdir(), `temp_audio_${Date.now()}.webm`);
        // Generate a temporary file path for the converted file
        const tempMkvPath = path.join(os.tmpdir(), `temp_audio_${Date.now()}.mkv`);

        // Download the file
        downloadFile(url, tempFilePath)
            .then((filePath) => {
                // Use ffprobe to get the file information
                ffmpeg.ffprobe(filePath, function(err, metadata) {
                    const duration = metadata?.format?.duration && parseFloat(metadata.format.duration);
                    if (err) {
                        reject('Error in ffprobe: ' + err.message);
                    } else if (!isNaN(duration) && isFinite(duration)) {
                        // If duration is found, resolve it
                        resolve(metadata.format.duration);
                        // Clean up: delete the temporary file
                        fs.unlink(filePath, (err) => {
                            if (err) console.error('Error deleting temp file:', err);
                        });
                    } else {
                        // If no duration found, convert to MKV and check duration again
                        ffmpeg(filePath)
                            .output(tempMkvPath)
                            .on('end', function() {
                                ffmpeg.ffprobe(tempMkvPath, function(err, metadata) {
                                    if (err) {
                                        reject('Error in ffprobe after conversion: ' + err.message);
                                    } else {
                                        const duration = metadata.format.duration;
                                        resolve(duration);
                                    }
                                    // Clean up: delete both temporary files
                                    fs.unlink(filePath, (err) => {
                                        if (err) console.error('Error deleting original temp file:', err);
                                    });
                                    fs.unlink(tempMkvPath, (err) => {
                                        if (err) console.error('Error deleting converted temp file:', err);
                                    });
                                });
                            })
                            .on('error', function(err) {
                                reject('Error converting file: ' + err.message);
                            })
                            .run();
                    }
                });
            })
            .catch((error) => {
                reject('Download error: ' + error);
            });
    });
};


// Example usage
function parseJSON(str) {
    if (!str || !str.startsWith('{') && !str.startsWith('[')) return;
    try {
        return JSON.parse(str);
    } catch (e) {
        return;
    }
}

function deepCopy(data) {
    return JSON.parse(JSON.stringify(data))
}

function extractTimestampFromUUID(uuid) {
    const timestampHex = uuid.split('-')[0];
    return parseInt(timestampHex, 16);
}

module.exports = {
    parseJSON,
    extractTimestampFromUUID,
    deepCopy,
    getAudioDuration
}