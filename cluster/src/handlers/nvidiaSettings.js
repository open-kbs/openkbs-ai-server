const { exec } = require('child_process');

const cudaCoresCache = {};

async function getCUDACores(gpuIndex) {
    // Check if the result is already in the cache
    if (cudaCoresCache.hasOwnProperty(gpuIndex)) {
        return cudaCoresCache[gpuIndex];
    }

    // If not in cache, execute the command to get the CUDA cores
    const command = `nvidia-settings -q [gpu:${gpuIndex}]/CUDACores -t`;

    try {
        const result = await new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else if (stderr) {
                    reject(new Error(stderr));
                } else {
                    resolve(stdout.trim());
                }
            });
        });

        // Parse the result to an integer
        const cudaCores = parseInt(result, 10);

        // Store the result in the cache
        cudaCoresCache[gpuIndex] = cudaCores;

        console.log(cudaCores)


        return cudaCores;
    } catch (error) {
        console.error('Error getting CUDA cores:', error);
        throw error;
    }
}

function setFanSpeed(gpu, speed) {
    return new Promise((resolve, reject) => {
        if (typeof speed !== 'number' || speed < 0 || speed > 100) {
            reject(new Error('Speed must be a number between 0 and 100.'));
            return;
        }

        const setSpeedCommand = `nvidia-settings -a '[gpu:${parseInt(gpu)}]/GPUFanControlState=1' -a '[fan:0]/GPUTargetFanSpeed=${parseInt(speed)}' -a '[fan:1]/GPUTargetFanSpeed=${parseInt(speed)}' -a '[fan:2]/GPUTargetFanSpeed=${parseInt(speed)}'`;
        exec(setSpeedCommand, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            if (stderr) {
                reject(new Error(stderr));
                return;
            }
            resolve(stdout);
        });
    });
}

function resetFanSpeed(gpu) {
    return new Promise((resolve, reject) => {
        const resetCommand = `nvidia-settings -a '[gpu:${parseInt(gpu)}]/GPUFanControlState=0'`;
        exec(resetCommand, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            if (stderr) {
                reject(new Error(stderr));
                return;
            }
            resolve(stdout);
        });
    });
}

const powerReadingsCache = {};
async function getPowerReadings(gpu) {
    if (powerReadingsCache[gpu]) return powerReadingsCache[gpu];

    return new Promise((resolve, reject) => {
        exec(`nvidia-smi -q -i ${gpu} -d POWER`, (error, stdout, stderr) => {
            if (error) {
                reject(`error: ${error.message}`);
                return;
            }
            if (stderr) {
                reject(`stderr: ${stderr}`);
                return;
            }

            // Parse the output to extract power limits
            const powerLimits = {
                defaultPowerLimit: null,
                minPowerLimit: null,
                maxPowerLimit: null
            };

            const lines = stdout.split('\n');
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine.includes('Default Power Limit') && trimmedLine.includes('W')) {
                    powerLimits.defaultPowerLimit = parseFloat(trimmedLine.split(': ')[1]);
                } else if (trimmedLine.includes('Min Power Limit') && trimmedLine.includes('W')) {
                    powerLimits.minPowerLimit = parseFloat(trimmedLine.split(': ')[1]);
                } else if (trimmedLine.includes('Max Power Limit') && trimmedLine.includes('W')) {
                    powerLimits.maxPowerLimit = parseFloat(trimmedLine.split(': ')[1]);
                }
            });
            powerReadingsCache[gpu] = powerLimits;
            resolve(powerLimits);
        });
    });
}


function setPowerLimit(gpu, watts) {
    return new Promise((resolve, reject) => {
        if (typeof watts !== 'number' || watts <= 0) {
            reject(new Error('Power limit must be a positive number.'));
            return;
        }

        // Construct the command to set the power limit using nvidia-smi
        const setPowerLimitCommand = `sudo nvidia-smi -i ${parseInt(gpu)} -pl ${parseInt(watts)}`;
        exec(setPowerLimitCommand, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            if (stderr) {
                reject(new Error(stderr));
                return;
            }
            resolve(stdout);
        });
    });
}


module.exports = {
    setFanSpeed,
    resetFanSpeed,
    setPowerLimit,
    getPowerReadings,
    getCUDACores
}