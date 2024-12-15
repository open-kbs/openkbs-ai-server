const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const { modelStatus } = require('./constants');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const modelsRelativePath = `./models/pipe`;


let pipesMap = {};

/** 
 * 
{
  TheBloke: { 'Llama-2-70B-chat-GPTQ': { default: 'default' } },
  'meta-llama': {
    'Llama-2-70b-chat-hf': { default: 'default' },
    'Llama-2-7b-chat-hf': { default: 'default' }
  },
  microsoft: {    
    'phi-1_5': { default: 'default' }
  },
  stabilityai: {
    'stable-diffusion-2-1': { default: 'default' },
    'stable-diffusion-xl-base-1.0': { default: 'default', inpaint-with-controlnet: 'inpaint-with-controlnet' }
  }
}
*
**/

fs.readdirSync(modelsRelativePath).forEach((dir) => {
    const dirPath = path.join(modelsRelativePath, dir);
    if (fs.statSync(dirPath).isDirectory()) {
        pipesMap[dir] = {};
        fs.readdirSync(dirPath).forEach((subDir) => {
            const subDirPath = path.join(dirPath, subDir);
            if (fs.statSync(subDirPath).isDirectory()) {
                pipesMap[dir][subDir] = {};
                fs.readdirSync(subDirPath).forEach((subSubDir) => {
                    const subSubDirPath = path.join(subDirPath, subSubDir);
                    if (fs.statSync(subSubDirPath).isDirectory()) {
                        const configFile = subSubDirPath + '/config.json';
                        const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile)) : {};
                        pipesMap[dir][subDir][subSubDir] = {
                            config
                        };
                    }
                });
            }
        });
    }
});

function isValidModel(vendor, model) {
    return pipesMap?.[vendor]?.[model];
}

const inProgressInstallations = {};

function isInstallationInProgress (vendor, model, pipe = 'default') {
    if (inProgressInstallations[`${vendor}--${model}--${pipe}`]) {
        return true;
    }
}

async function checkCacheSize(cachePath) {
    const { stdout } = await exec(`du -bs ${cachePath}`);
    const size = stdout.split('\t')[0];
    return size;
}

function installModel(vendor, model, pipe = 'default') {
    
    if (!isValidModel(vendor, model)) {
        return resolve({msg: 'Invalid model', status: 400});
    }

    const key = `${vendor}--${model}--${pipe}`;

    inProgressInstallations[key] = true;

    const modelPath = `./models/pipe/${vendor}/${model}/${pipe}`;
    const userHomeDir = os.homedir();
    const cachePath = `${userHomeDir}/.cache/huggingface/hub/models--${vendor}--${model}/`;
    if (fs.existsSync(modelPath) && fs.existsSync(cachePath)) {
        const minSizePath = `./models/pipe/${vendor}/${model}/min_size`;
        const minSize = fs.existsSync(minSizePath) ? fs.readFileSync(minSizePath, 'utf8') : 0;
        
        checkCacheSize(cachePath).then(size => {
            delete inProgressInstallations[key];
            if (parseInt(size) >= parseInt(minSize)) {
                console.log(cachePath);
                console.log(`Model ${cachePath} with size ${size}, already installed`);
                return Promise.resolve({msg: `Model is already installed.`, status: 400});
            } else {
                console.log(`The model appears to be corrupted expected minSize is ${minSize}, but found size ${size}. Please uninstall and reinstall it (delete ${cachePath})`);
                process.exit()
            }
        });
    }

    const installAndDownload = spawn('bash', ['-c', `pip3 install -r ${modelPath}/requirements.txt && .env/bin/python ${modelPath}/download.py`]);

    // Read events from both stdout and stderr they contain both valid install messages
    installAndDownload.stdout.on('data', (data) => {  
        console.error(`stdout: ${data.toString()}`);
    });

    // Read events from both stdout and stderr they contain both valid install messages
    installAndDownload.stderr.on('data', (data) => {
        console.error(`stderr: ${data.toString()}`);
    });

    installAndDownload.on('error', (err) => {  
        const errorMsg = 'Failed to start installModel subprocess.';  
        console.error(errorMsg, err);
        delete inProgressInstallations[key];
        return Promise.resolve({err: errorMsg, status: 400});
    });

    installAndDownload.on('close', (code) => {
        if (code !== 0) {
            console.error(`installModel process exited with code ${code}`);
        }
        delete inProgressInstallations[key];
    });

    return Promise.resolve({msg:'Installation process started.', status: 200});
}

function uninstallModel(vendor, model) {
    return new Promise((resolve, reject) => {
        if (!isValidModel(vendor, model)) {
            return resolve({msg: 'Invalid model', status: 400});
        }

        const userHomeDir = os.homedir();

        const uninstall = spawn('rm', ['-rf', `${userHomeDir}/.cache/huggingface/hub/models--${vendor}--${model}/`]);

        uninstall.on('close', (code) => {
            if (code !== 0) {
                resolve({err: `uninstallModel process exited with code ${code}`, status: 400});
            } else {
                resolve({msg: 'Uninstalled', status: 200});
            }
        });
    });
}

let listModelsRequestId = 0;
let listModelsCache = null;

function listModels(props) {
    listModelsRequestId++;
    return new Promise((resolve, reject) => {
        const x = props?.fetchModelsEveryX;
        if (x && listModelsCache !== null && listModelsRequestId%x !== 0) {
            return resolve(listModelsCache)            
        }

        const userHomeDir = os.homedir();
        const list = spawn('du', ['-bs', `${userHomeDir}/.cache/huggingface/hub/models*`], { shell: true });
        let output = '';
        list.stdout.on('data', (data) => {
            output += data;
        });
        list.on('close', (code) => {
            if (code !== 0) {
                const res = {data: { models: {} }, status: 200};
                listModelsCache = res;
                return resolve(res);
            }
            const data = output.split('\n').reduce((acc, line) => {
                if (line) {
                    const [size, path] = line.split('\t');
                    let [objectType, vendor, model] = path.split(path.sep).pop().split('--');
                    if (!isValidModel(vendor, model)) return acc;
                    objectType = 'models'
                    acc[objectType] = acc[objectType] || {};
                    acc[objectType][vendor] = acc[objectType][vendor] || {};
                    if (!isInstallationInProgress(vendor, model)) {
                        acc[objectType][vendor][model] = { status: modelStatus.INSTALLED, size: size};
                    } else {
                        acc[objectType][vendor][model] = { status: modelStatus.INSTALLING, size: size};
                    }
                }
                return acc;
            }, {});
            const res = {...data, status: 200};
            listModelsCache = res;
            resolve(res);
        });
    });
}

module.exports = {
    installModel,
    listModels,
    uninstallModel,
    isInstallationInProgress,
    pipesMap
}