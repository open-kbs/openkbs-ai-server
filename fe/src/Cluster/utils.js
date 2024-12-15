export function getNetworkPipes(network){
    const output = [];
    if (network.length) {
        for(let subnet of network) {
            if (subnet.servers) {
                for (let server of subnet.servers) {
                    const { url, devices, models, pipesMap } = server;
                    for (let vendor in models) {
                        for (let model in models[vendor]) {
                            const modelPipes = pipesMap?.[vendor]?.[model]
                            for (let pipe in modelPipes) {
                                const config = modelPipes[pipe]?.config
                                output.push({serverURL:url, vendor, model, pipe, subnet: subnet.subnet, config});
                            }
                            
                        }                        
                    }
                }
            }

        }
    }
    return output;
}