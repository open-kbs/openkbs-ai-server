const { spawn, exec } = require('child_process');
const { createHash } = require('crypto');
const { unixSocketClients, unixSocketConnect } = require('../net/unixSocket');
const { getPowerReadings } = require('../handlers/nvidiaSettings');

const sha256 = (msg) => createHash("sha256").update(msg).digest("hex");

const createPipeLoadedSortFunction = (pipeId) => (a, b) => {
    const aIncludesPipeId = a.pipes?.includes(pipeId);
    const bIncludesPipeId = b.pipes?.includes(pipeId);
    if (aIncludesPipeId && !bIncludesPipeId) return -1;
    if (!aIncludesPipeId && bIncludesPipeId) return 1;
    return 0;
};

function decodeJWT(token) {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(Buffer.from(payload, 'base64').toString());
    } catch (error) {
        console.error('Failed to decode JWT:', error);
        return null;
    }
}

// Modified sortArrayByProperties to accept a custom sort function
function sortArrayByProperties(arr, properties) {
    return arr.sort((a, b) => {
        for (let prop of properties) {
            if (typeof prop === 'function') {
                // If the property is a custom sort function, use it for comparison
                const result = prop(a, b);
                if (result !== 0) return result;
            } else {
                let desc = prop.startsWith('-');
                let propName = desc ? prop.substring(1) : prop;

                // Check if the property exists in the objects
                if (a.hasOwnProperty(propName) && b.hasOwnProperty(propName)) {
                    // Convert to numbers if the properties are numeric strings
                    let valA = isNaN(Number(a[propName])) ? a[propName] : Number(a[propName]);
                    let valB = isNaN(Number(b[propName])) ? b[propName] : Number(b[propName]);

                    // Compare the two values
                    if (valA > valB) return desc ? 1 : -1;
                    if (valA < valB) return desc ? -1 : 1;
                }
            }
        }
        // If all properties are equal or not present, maintain original order
        return 0;
    });
}


function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

function calculateTotal(deviceObject, key, parser = parseInt) {
    let total = 0;
    if (deviceObject.gpus && Array.isArray(deviceObject.gpus)) {
        deviceObject.gpus.forEach(device => {
            if (device?.[key]) {
                total += parser(device?.[key]);
            }
        });
    }
    return total;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const pythonWorkers = {};

function killPythonWorker(CUDA_VISIBLE_DEVICES) {
    pythonWorkers?.[CUDA_VISIBLE_DEVICES]?.stdin?.pause();
    pythonWorkers?.[CUDA_VISIBLE_DEVICES]?.kill();
    delete pythonWorkers[CUDA_VISIBLE_DEVICES];
}

function spawnPythonWorker(CUDA_VISIBLE_DEVICES) {
    return new Promise(async (resolve, reject) => {
        // Set the environment variable
        const env = { ...process.env, CUDA_VISIBLE_DEVICES };

        // Spawn the Python subprocess
        const python = spawn('.env/bin/python', ['./models/src/pipe.py'], { env });

        pythonWorkers[CUDA_VISIBLE_DEVICES] = python;
        // Resolve the promise when the Python script produces its first output
        python.stdout.once('data', (data) => {
            resolve(python);
            console.log(`Python: CUDA_VISIBLE_DEVICES ${CUDA_VISIBLE_DEVICES} ${data}`);
        });

        python.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });

        // Log when the Python script exits
        python.on('close', async (code) => {
            console.log(`child process exited with code ${code}`);
            delete unixSocketClients[CUDA_VISIBLE_DEVICES];
            // If the process dies, restart it
            if (code !== 0) {
                console.log(`Restarting Python subprocess with CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES}`);
                await spawnPythonWorker(CUDA_VISIBLE_DEVICES);

                unixSocketClients[CUDA_VISIBLE_DEVICES] = {
                    socket: await unixSocketConnect(CUDA_VISIBLE_DEVICES, true),
                    socket2: await unixSocketConnect(CUDA_VISIBLE_DEVICES, true, '2')
                };
            }
        });

        // Reject the promise if an error occurs
        python.on('error', (err) => {
            console.error('Failed to start subprocess.', err);
            reject(err);
        });
    });
}

const gpuModelToCudaCores = {
    'Tesla K80': 2496,
    'Tesla P100': 3584,
    'Tesla V100': 5120,
    'GeForce GTX 1080': 2560,
    'GeForce GTX 1080 Ti': 3584,
    'GeForce RTX 2080': 2944,
    'GeForce RTX 2080 Ti': 4352,
    'GeForce RTX 3070': 5888,
    'GeForce RTX 3080': 8704,
    'GeForce RTX 3090': 10496,
    'GeForce RTX 3090 Ti': 10752,
    'GeForce RTX 4090': 16384,
    'Quadro P6000': 3840,
    'Quadro P5000': 2560,
    'Quadro P4000': 1792,
    'Quadro P2000': 1024,
    'Quadro P1000': 640,
    'Quadro P620': 512,
    'Quadro P600': 384,
    'Quadro P400': 256,
    'Quadro RTX 8000': 4608,
    'Quadro RTX 6000': 4608,
    'Quadro RTX 5000': 3072,
    'Quadro RTX 4000': 2304,
    'Quadro RTX 3000': 1920,
    'Quadro RTX A6000': 10752,
    'Quadro RTX A5000': 8192,
    'Quadro RTX A4000': 6144,
    'Quadro RTX A2000': 3328,
    'H100' : 18432,
    'A100': 6912,
    'A40': 10752,
    'A30': 8192,
    'A10': 6144,
    'A16GB': 3328,
};

function getCUDACores(gpuModel) {
    let cudaCores;

    for (const model in gpuModelToCudaCores) {
        if (gpuModel.endsWith(model)) {
            cudaCores = gpuModelToCudaCores[model];
            break;
        }
    }

    if (cudaCores === undefined) {
        return 0;
    }

    return cudaCores;
}

let gpuType = null;
const getGPUType = () => gpuType;
async function getSMI() {
    if (gpuType === null) {
        try {
            const res = await getNvidiaSMI();
            gpuType = 'NVIDIA';
            return res;
        } catch (e) {
            if (e.toString() === 'command not found') {
                const res = await getRocmSMI();
                gpuType = 'AMD';
                return res
            }
        }
    } else if (gpuType === 'AMD') {
        return getRocmSMI();
    } else if (gpuType === 'NVIDIA') {
        return getNvidiaSMI();
    }
}

async function runStressTestOnDevice(device) {
    return new Promise((resolve, reject) => {
        const stress_test = spawn('bash', ['-c', `CUDA_VISIBLE_DEVICES=${device.toString()} .env/bin/python models/stress_test.py`]);

        stress_test.stdout.on('data', async (data) => {
            resolve();
        });

        stress_test.stderr.on('data', (data) => {
            console.error(`Error on device ${device}: ${data}`);
            reject(new Error(data));
        });

        stress_test.on('error', (error) => {
            console.error(`Failed to start stress test on device ${device}: ${error}`);
            reject(error);
        });
    });
}

let rocmSMIDeviceMapping = [];

if (process.env.ROCM_SMI_DEVICE_MAPPING) {
    rocmSMIDeviceMapping = process.env.ROCM_SMI_DEVICE_MAPPING.split(',').map(Number);
    console.log('ROCM_SMI_DEVICE_MAPPING env initialized', rocmSMIDeviceMapping)
}

async function detectRocmMapping() {
    const devices = (await getRocmSMI(true)).map(o => o.index);

    console.log(`Detecting rocm-smi gpu indexes ...`)

    let i = 0;
    for (let rocmId of devices) {
        try {

            await runStressTestOnDevice(i);
            const res = await getRocmSMI(true);
            console.log('res', res)
            const {index} = res.find(o => {
                return parseInt(o.memory_used) > 5000
            })
            console.log(`rocm-smi GPU[${index}] = CUDA_VISIBLE_DEVICES:${i}`);
            rocmSMIDeviceMapping[index] = i;
        } catch (error) {
            console.error(`An error occurred while running stress test on device ${rocmId}:`, error);
            rocmSMIDeviceMapping[i] = i; // fallback if detection fails
        }
        i++
    }

    console.log(`\n\nTo avoid this check, use "ROCM_SMI_DEVICE_MAPPING=${rocmSMIDeviceMapping.join(',')} ./your_start_cmd.sh" to start your server\n\n`);
}

async function getRocmSMI(force = false) {
    if (rocmSMIDeviceMapping.length === 0 && !force) {
        await detectRocmMapping();
    }

    return new Promise((resolve, reject) => {
        exec('rocm-smi && echo "_JSON_START_" && rocm-smi --json --showbus --showuniqueid --showmeminfo vram', async (error, stdout, stderr) => {
            if (error) {
                return reject('Error executing command');
            }

            const smiOutput = stdout;
            const jsonStartIndex = smiOutput.indexOf('_JSON_START_') + '_JSON_START_'.length;
            const jsonString = smiOutput.slice(jsonStartIndex).trim();
            const jsonData = JSON.parse(jsonString);

            // Define regex patterns to match the required values
            const tempRegex = /(\d+\.\d+)°?[Cc]/;
            const powerRegex = /(\d+\.\d+)W/;
            const fanRegex = /(\d+)%/;
            const pwrCapRegex = /(\d+\.\d+)W\s+\d+%/;
            const vramUsageRegex = /(\d+\.\d+)W\s+(\d+)%/;

            // Split the non-JSON output into lines
            const nonJsonOutput = smiOutput.slice(0, jsonStartIndex).trim();
            const lines = nonJsonOutput.split('\n');

            // Filter out lines that do not contain GPU data
            const gpuLines = lines.filter(line => tempRegex.test(line));

            const gpus = gpuLines.map((line, index) => {

                const tempMatch = tempRegex.exec(line);
                const powerMatch = powerRegex.exec(line);
                const fanMatch = fanRegex.exec(line);
                const pwrCapMatch = pwrCapRegex.exec(line);
                const vramUsage = vramUsageRegex.exec(line)[2];

                const cardData = jsonData[`card${index}`];

                const memoryTotalMB = Math.round(cardData['VRAM Total Memory (B)'] / 1024 / 1024);
                const memoryUsedMB = Math.round(cardData['VRAM Total Used Memory (B)'] / 1024 / 1024);
                const memoryFreeMB = memoryTotalMB - memoryUsedMB;

                const paramsByModel = (memoryTotal) => {
                    if (Math.abs(memoryTotal-24576) < 100) {
                        return {
                            "name": "AMD RX 7900 XTX",
                            "max_tflops": "61",
                            "clocks_max": "2500",
                            "cores": 6144,
                            "min_power_limit": 100,
                            "max_power_limit": 425,
                            "default_power_limit": 339,
                        };
                    }
                    // Add more conditions for other models if necessary
                };

                const fixedIndex = force ? index : rocmSMIDeviceMapping[index];

                return {
                    "index": fixedIndex.toString(),
                    "pci_bus_id": cardData['PCI Bus'],
                    "temperature_gpu": tempMatch[1],
                    "fan_speed": fanMatch[1],
                    "memory_total": memoryTotalMB.toString(),
                    "memory_free": memoryFreeMB.toString(),
                    "memory_used": memoryUsedMB.toString(),
                    "power_limit": pwrCapMatch[1],
                    "power_draw": powerMatch[1],
                    "gpuid": cardData["Unique ID"],
                    ...(paramsByModel(memoryTotalMB))
                };
            });

            resolve(gpus);
        });
    });
}
async function getNvidiaSMI() {
    return new Promise((resolve, reject) => {
        exec('nvidia-smi --query-gpu=index,uuid,pci.bus_id,name,temperature.gpu,fan.speed,memory.total,memory.free,memory.used,power.draw,power.limit,clocks.max.graphics  --format=csv', async (error, stdout, stderr) => {

            if (error && error.toString().includes('nvidia-smi: not found')) {
                return reject('command not found')
            }

            else if (error) {
                console.error(`exec error: ${error}`);
                const failedGPUNumber = stdout ? stdout.match(/GPU(\d{4}:\d{2}:\d{2}\.\d)/)?.[1] : null;

                if (failedGPUNumber) {
                    console.log('failedGPUNumber', failedGPUNumber)
                    // const command = `sudo nvidia-smi drain -p ${failedGPUNumber} -m 1`;
                    const command = `echo '${failedGPUNumber}' > /tmp/failedGPUNumber && sudo /sbin/reboot`;
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`Error: ${error.message}`);
                            return;
                        }
                        if (stderr) {
                            console.error(`Stderr: ${stderr}`);
                            return;
                        }
                        console.log(`Stdout: ${stdout}`);
                    });

                } else {
                    console.log(stdout)
                }

                return;
            }

            // Parse the output
            const lines = stdout.split('\n');

            const headers = lines[0].split(', ').map(header => header.toLowerCase());
            const promises = lines.slice(1).filter(line => line).map(async (line) => {
                const values = line.split(', ');
                const gpuIndex = values[0];

                const gpu = {};

                try {
                    // const cudaCores = await getCUDACores(gpuIndex);
                    const cudaCores = await getCUDACores(values[3]);
                    gpu.cores = cudaCores;
                } catch (e) {
                    console.log('Unable to fetch getCUDACores')
                }

                try {
                    const { defaultPowerLimit, minPowerLimit, maxPowerLimit } = await getPowerReadings(gpuIndex);
                    gpu.default_power_limit = defaultPowerLimit;
                    gpu.min_power_limit = minPowerLimit;
                    gpu.max_power_limit = maxPowerLimit;
                } catch (e) {
                    console.log('Unable to fetch power readings')
                }

                headers.forEach((header, i) => {
                    // Remove units and convert to more user-friendly format
                    let value = values[i].replace(' %', '').replace(' MiB', '').replace(' W', '').replace(' MHz', '');
                    let key = header.replace(' [%]', '').replace(' [mib]', '').replace('.', '_').replace(' [w]', '').replace(' [mhz]', '');

                    if (key === 'clocks_max.graphics') key = 'clocks_max';

                    if (key === 'uuid') {
                        key = 'gpuid'
                        // value = value
                    };

                    gpu[key] = value;
                });

                if (gpu?.clocks_max && gpu.cores) {
                    gpu.max_tflops = (parseInt(gpu.cores) * parseInt(gpu?.clocks_max) * 2 / 1000000).toFixed(2);
                } else {
                    // @Todo calculate tflops by gpuName with predefined values
                }

                return gpu;
            });

            const gpus = await Promise.all(promises);

            resolve(gpus)
        });
    });
}

module.exports = {
    killPythonWorker,
    getGPUType,
    getSMI,
    spawnPythonWorker,
    calculateTotal,
    sha256,
    sleep,
    sortArrayByProperties,
    createPipeLoadedSortFunction,
    decodeJWT
}