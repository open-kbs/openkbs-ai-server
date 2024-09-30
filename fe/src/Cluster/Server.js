import React, { useEffect, useState } from 'react';
import {
    Checkbox,
    Chip,
    Collapse,
    Container, FormControlLabel, Grid, IconButton, Slider,
} from '@mui/material';
import { styled } from '@mui/material/styles';

import { useParams } from 'react-router-dom';

import { Card, CardContent, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Button, LinearProgress } from '@mui/material';
import { APIRequest } from '../API/APIRequest';
import { LoadPipe } from './LoadPipe';
import { colorEasyGreen, colorSecondary, colorSecondaryLight } from '../App/theme';
import Badge from '@mui/material/Badge';
import { PlayCircle, Settings } from '@mui/icons-material';
import { stateToArray } from '../App/utils';
import { baseAPIUrl } from '../App/App';

function extractPipesWithoutModels(data) {
    const models = data.models;
    const pipesMap = data.pipesMap;
    const pipesWithoutModels = [];

    for (const vendor in pipesMap) {
        for (const model in pipesMap[vendor]) {
            if (!models?.[vendor] || !models?.[vendor]?.[model]) {
                pipesWithoutModels.push({ vendor, model });
            }
        }
    }

    return pipesWithoutModels;
}

function formatSize(bytes) {
    const output = Math.round(parseInt(bytes) / 1024 / 1024) + ' MB';
    return output;
}


// Custom styled components
const ElegantCheckbox = styled(Checkbox)(({ theme }) => ({
    padding: '4px',
    '& .MuiSvgIcon-root': {
        width: '18px',
        height: '18px',
    },
}));

const ElegantSlider = styled(Slider)(({ theme }) => ({
    height: '2px',
    '& .MuiSlider-thumb': {
        height: '12px',
        width: '12px',
    },
    '& .MuiSlider-track': {
        height: '2px',
    },
    '& .MuiSlider-rail': {
        height: '2px',
    },
}));

const Server = ({ clusterState }) => {
    const [expandedId, setExpandedId] = useState(null);
    const [powerReadings, setPowerReadings] = useState({});
    const [fanSpeed, setFanSpeed] = useState(0);
    const [powerLimit, setPowerLimit] = useState(0);
    const [isFanEnabled, setIsFanEnabled] = useState(false);
    const [isPowerEnabled, setIsPowerEnabled] = useState(false);


    const handleExpandClick = (deviceId) => {
        setExpandedId(expandedId === deviceId ? null : deviceId);
    };

    let serverUrl = useParams().serverUrl;
    if (!serverUrl.endsWith('/')) serverUrl += '/'


    useEffect(() => {
        APIRequest('get', baseAPIUrl + 'getPowerReadings').then((data) => {
            if (data?.data) {
                setPowerReadings(data.data);
            }
        });
    }, []);

    const handleFanSpeedChange = (gpuIndex, newValue) => {
        setFanSpeed(newValue);
        APIRequest('get', serverUrl + `setFanSpeed/${gpuIndex}/${newValue}`)
    };

    const handlePowerLimitChange = (gpuIndex, newValue) => {
        setPowerLimit(newValue);
        APIRequest('get', serverUrl + `setPowerLimit/${gpuIndex}/${newValue}`)
    };

    // Add handlers for checkbox changes
    const handleFanCheckboxChange = (gpuIndex, event) => {
        setIsFanEnabled(event.target.checked);
        if (!event.target.checked) {
            APIRequest('get', serverUrl + `resetFanSpeed/${gpuIndex}`)
        }
    };

    const handlePowerCheckboxChange = (gpuIndex, event) => {
        setIsPowerEnabled(event.target.checked);
        if (!event.target.checked) {
            APIRequest('get', serverUrl + `resetPowerLimit/${gpuIndex}`)
        }
    };

    const handleUninstall = (vendor, model) => {
        APIRequest('get', serverUrl + `uninstall/${vendor}/${model}`)
    }

    const handleInstall = (vendor, model) => {
        APIRequest('get', serverUrl + `install/${vendor}/${model}`)
    }

    const handleDeletePipe = (deviceId, pipeId) => {
        APIRequest('get', serverUrl + `delete_pipe/${deviceId}/${pipeId}`)
    }

    const handleCallPipe = (deviceId, pipeId, pipesMap) => {
        const token = localStorage.getItem('userToken');
        const randomNumber = (Math.floor(Math.random() * 10**15) + 1);

        const [vendor, model, pipe] = pipeId.split('--');

        const exampleQuery = pipesMap?.[vendor]?.[model]?.[pipe]?.config?.exampleQuery || 'prompt=Once upon a time';

        window.open(`${serverUrl}admin/pipe/${pipeId}?${exampleQuery}&token=${token}&seed=${randomNumber}&deviceId=${deviceId}`)
    }

    const serverState = (stateToArray(clusterState)?.find(server => server.url === serverUrl));
    if (!serverState) return null;

    const uninstalled = extractPipesWithoutModels(serverState)

    function convertPipesMapToArray(pipesMap) {
        let result = [];
        for (let user in pipesMap) {
            for (let pipe in pipesMap[user]) {
                for (let version in pipesMap[user][pipe]) {
                    if (pipesMap[user][pipe][version].isAvailable) {
                        result.push(`${user}--${pipe}--${version}`);
                    }
                }
            }
        }
        return result;
    }

    return (
        <Container>
            <Grid container spacing={3}>
                {serverState?.devices?.map((device, idx) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                        <Card style={{ marginBottom: '20px' }}>
                            <CardContent>
                                <Typography variant="h5" component="div">
                                    Device {device.deviceId}
                                </Typography>
                                {device.gpus.map((gpu, index) => {
                                    const memUsage = Math.round(parseInt(gpu.memory_used) / parseInt(gpu.memory_total) * 100);
                                    const powerUsage = Math.round(parseInt(gpu.power_draw) / parseInt(gpu.power_limit) * 100);
                                    return (
                                        <div key={index}>
                                            <Typography variant="body2">
                                                GPU Index: {gpu.index}
                                            </Typography>
                                            <Typography variant="body2">
                                                {gpu.name}
                                            </Typography>
                                            <Typography variant="body2">
                                                {gpu.gpuid.substring(0, 17)}
                                            </Typography>
                                            <Typography variant="body2">
                                                PCI Bus ID: {gpu.pci_bus_id}
                                            </Typography>
                                            <Typography variant="body2">
                                                Fan {gpu.fan_speed} %
                                                <LinearProgress variant="determinate" value={parseInt(gpu.fan_speed)} />
                                            </Typography>
                                            <Typography variant="body2">
                                                {gpu.temperature_gpu} °C
                                                <LinearProgress variant="determinate" color={
                                                    parseInt(gpu.temperature_gpu) > 70 && 'warning'
                                                    || undefined
                                                } value={parseInt(gpu.temperature_gpu)} />
                                            </Typography>
                                            <Typography variant="body2">
                                                {gpu.power_draw} W / {gpu.power_limit} W
                                                <LinearProgress variant="determinate" color="secondary" value={powerUsage} />
                                            </Typography>
                                            <Typography variant="body2">
                                                {(gpu.memory_used / 1024).toFixed(2)} GB / {(gpu.memory_total / 1024).toFixed(2)} GB
                                                <LinearProgress variant="determinate" color="success"
                                                    value={memUsage} />
                                            </Typography>
                                            <br />

                                            <Collapse in={expandedId === device.deviceId} timeout="auto" unmountOnExit>
                                                <CardContent>
                                                    {/* Replace buttons with sliders and checkboxes */}
                                                    <FormControlLabel
                                                        control={<ElegantCheckbox checked={isFanEnabled} onChange={(e) => handleFanCheckboxChange(gpu.index, e)} />}
                                                        label={<Typography variant="body2" sx={{ fontSize: '12px' }}>Enable Fan Settings</Typography>}
                                                    />
                                                    <ElegantSlider
                                                        value={fanSpeed}
                                                        onChange={(e) => handleFanSpeedChange(gpu.index, e.target.value)}
                                                        disabled={!isFanEnabled}
                                                        min={0}
                                                        max={100}
                                                        step={1}
                                                    />
                                                    <FormControlLabel
                                                        control={<ElegantCheckbox checked={isPowerEnabled} onChange={(e) => handlePowerCheckboxChange(gpu.index, e)} />}
                                                        label={<Typography variant="body2" sx={{ fontSize: '12px' }}>Enable Power Settings</Typography>}
                                                    />
                                                    <ElegantSlider
                                                        value={powerLimit}
                                                        onChange={(e) => handlePowerLimitChange(gpu.index, e.target.value)}
                                                        disabled={!isPowerEnabled}
                                                        min={powerReadings[gpu.index]?.minPowerLimit}
                                                        max={powerReadings[gpu.index]?.maxPowerLimit}
                                                        step={1}
                                                    />
                                                </CardContent>
                                            </Collapse>

                                        </div>
                                    )
                                })}
                                <Typography variant="body2">
                                    {device?.pipes?.length > 0 && <>Loaded Models:<br /></>}
                                    {[...device?.pipes].reverse().map(pipe => {
                                        return (
                                            <span key={pipe} title={pipe}>
                                                <Chip
                                                    style={{ marginBottom: '20px' }}
                                                    label={
                                                        <Typography style={{fontSize: 10}}>
                                                            {pipe.split('--')[1].split('-').slice(-3).join('-')} <strong>{pipe.split('--')[2]}</strong>
                                                        </Typography>
                                                    }
                                                    labelStyle={{ fontSize: '1px' }}
                                                    component="a"
                                                    onClick={() => handleCallPipe(device.deviceId, pipe, serverState?.pipesMap)}
                                                    icon={<PlayCircle />}
                                                    onDelete={() => handleDeletePipe(device.deviceId, pipe)}
                                                    variant="outlined"
                                                />
                                                <Badge badgeContent={device?.queue?.filter(o => o.pipeId === pipe).length} color="primary"></Badge>
                                            </span>
                                        )
                                    })}
                                    <br />
                                    <LoadPipe pipes={convertPipesMapToArray(serverState?.pipesMap)} loadedPipes={device?.pipes} serverUrl={serverUrl} device={device} />
                                </Typography>

                            </CardContent>

                            <IconButton
                                onClick={() => handleExpandClick(device.deviceId)}
                                aria-expanded={expandedId === device.deviceId}
                                aria-label="show more"
                            >

                                <Settings />
                            </IconButton>

                        </Card>
                    </Grid>
                ))}
            </Grid>
            {renderModels(serverState, uninstalled, handleUninstall, handleInstall)}
        </Container>
    );
};

function renderModels(serverState, uninstalled, handleUninstall, handleInstall) {
    return (
        <TableContainer component={Paper}>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Model</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Size</TableCell>
                        <TableCell>Action</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {serverState?.models && Object.entries(serverState.models).map(([vendor, models]) =>
                        Object.entries(models).map(([model, details]) => {
                            let statusText = details.status === 'INSTALLING' ? "INSTALLING ..." : details.status;
                            let statusColor = (details.status === 'INSTALLING') ? colorSecondaryLight : colorEasyGreen;

                            if (details.status === 'INSTALLED'
                                && serverState.devices?.find(device => device.pipes.includes(`${vendor}--${model}--default`))) {
                                statusColor = colorSecondary;
                                statusText = 'LOADED'
                            }

                            return (
                                <TableRow key={`${vendor}--${model}`}>
                                    <TableCell>{`${vendor}--${model}`}</TableCell>
                                    <TableCell><Typography variant="p" style={{ color: statusColor }}>
                                        {statusText}
                                    </Typography></TableCell>
                                    <TableCell>{formatSize(details.size)}</TableCell>
                                    <TableCell>
                                        <Button variant="outlined" onClick={() => handleUninstall(vendor, model)}>
                                            Uninstall
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )
                        })
                    )}

                    {uninstalled?.map(({ vendor, model }) => {
                        if (!vendor) return;
                        return (
                            <TableRow key={`${vendor}--${model}`}>
                                <TableCell>{`${vendor}--${model}`}</TableCell>
                                <TableCell></TableCell>
                                <TableCell></TableCell>
                                <TableCell>
                                    <Button variant="contained" onClick={() => handleInstall(vendor, model)}>
                                        Install
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )
                    })}

                </TableBody>
            </Table>
        </TableContainer>
    )
}

export default Server;
