import './App.css';
import { useState, useEffect, createContext } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './Navbar.js';
import { Alert, Box, LinearProgress, Typography, IconButton } from '@mui/material';
import jsondiffpatch from 'jsondiffpatch';
import Drawer from '@mui/material/Drawer';
import Toolbar from '@mui/material/Toolbar';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Badge from '@mui/material/Badge';
import {Dns as Server, Add, Hub, QuestionMark, Delete, CloudOff, LinkOff} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import * as React from "react";
import ServerPage from "../Cluster/Server.js";

import { calcUsageTotal, isMobile, stateToArray } from "./utils.js";
import { alpha } from '@mui/material/styles';
import Snackbar from "@mui/material/Snackbar";
import { APIRequest } from "../API/APIRequest.js";
import { RegisterUser } from '../User/Register';
import { LoginUser } from '../User/Login';
import { ConnectServer } from '../Cluster/ConnectServer';
import { ConnectionGrant } from '../Cluster/ConnectionGrant';
import { initAdminWS } from '../Net/adminWS';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';

export const AlertContext = createContext();
export const APIContext = createContext();
export const drawerWidth = 300;

const backendPort = process.env.REACT_APP_BACKEND_PORT || '8080';
export const baseAPIUrl = process.env.REACT_APP_BACKEND_API_URL || `${window.location?.protocol}//${window.location?.hostname}:${backendPort}/`

export const adminWSURL = baseAPIUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');

function App() {
    const [clusterState, setClusterState] = useState({});
    const [serverConnections, setServerConnections] = useState([]);
    const [systemAlert, setSystemAlert] = useState({});
    const [APIData, setAPIData] = useState({
        kbs: {},
        KBData: {},
    });

    const handleDrawerClose = () => {
        setOpen(false);
    };

    const [open, setOpen] = useState(() => {
        const storedValue = localStorage.getItem('menuOpen');

        if (isMobile) {
            return false;
        } else {
            return storedValue ? JSON.parse(storedValue) : true;
        }
    });

    const location = useLocation();
    const pathSegments = location.pathname.split('/');
    const firstPathSegment = pathSegments && pathSegments[1];

    const [windowHeight, setWindowHeight] = useState(window.innerHeight);

    /***
     * Connect admin websocket
     */
    useEffect(() => {
        initAdminWS(adminWSURL, {
            'INIT_STATE': (data) => {
                setClusterState(data.state);
            },
            'PATCH_STATE': (data) => {
                setClusterState(prevState => {
                    let nextState = JSON.parse(JSON.stringify(prevState));
                    try {
                        jsondiffpatch.patch(nextState, data.delta);
                    } catch(e) {
                        console.log(`unable to patch the state ${e.message}`, {delta: data.delta, nextState})
                    }

                    return nextState;
                });
            },
            'NEW_CONNECTION_REQUEST': ({ connection, url }) => {
                window.location.replace(`/connection-grant/${encodeURIComponent(url)}`)
            },
            'ON_CLOSE': () => setClusterState({})
        }
        );
    }, []);

    /***
     * Load Server Connections
     */
    useEffect(() => {
        APIRequest('get', baseAPIUrl + 'serverConnections').then((data) => {
            if (!data?.data) return;
            setServerConnections(data?.data)
        });
    }, []);

    // /***
    //  * ERROR HANDLERS
    //  */
    useEffect(() => {
        const noUsersRegistered = (e) => {
            if (window?.location?.pathname !== '/register') {
                window.location.replace('/register');
            }
        };

        const unauthorizedError = (e) => {
            localStorage.setItem('userToken', '');
            if (window?.location?.pathname !== '/login') {
                window.location.replace('/login');
            }
        };

        window.addEventListener('noUsersRegistered', noUsersRegistered);
        window.addEventListener('unauthorizedError', unauthorizedError);

        return () => {
            window.removeEventListener('noUsersRegistered', noUsersRegistered);
            window.removeEventListener('unauthorizedError', unauthorizedError);
        }

    }, []);

    const tabStyle = {
        '&.Mui-selected': {
            backgroundColor: alpha('#fff', 0.06),
        },
        '&.Mui-selected:hover': {
            backgroundColor: alpha('#fff', 0.1),
        },
    };

    if (typeof systemAlert?.msg !== 'string') {
        delete systemAlert.msg;
    }

    const clusterArray = stateToArray(clusterState);

    const totals = calcUsageTotal(clusterArray);
    const memUsagePerc = Math.round(parseInt(totals.total_memory_used) / parseInt(totals.total_memory_total) * 100);
    const powerUsagePerc = Math.round(parseInt(totals.total_power_draw) / parseInt(totals.total_power_limit) * 100);

    // Combine clusterArray and serverConnections
    const combinedServers = [
        ...clusterArray,
        ...serverConnections.filter(sc => !clusterArray.some(ca => ca.url === sc.url)).map(sc => ({ ...sc, disconnected: true }))
    ];
    
    return (<div className="App">
        <APIContext.Provider value={{ APIData, setAPIData }}>
            <Navbar open={open} setOpen={setOpen} />
            <Drawer
                variant="persistent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
                }}
                open={open}
            >
                <Toolbar />

                <Box sx={{ overflow: 'auto' }}>
                    <List onClick={isMobile ? handleDrawerClose : () => { }}>
                        {/* <ListItemButton selected={firstPathSegment === ''} component={Link} to="/" sx={tabStyle}>
                        <ListItemIcon>
                        <Apps />
                        </ListItemIcon>
                        <ListItemText primary="Apps"/>
                    </ListItemButton> */}

                        {(
                            <>
                                <ListItemButton
                                    // selected={firstPathSegment === 'network'}
                                    component={Link}
                                    sx={{ ...tabStyle, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                        <ListItemIcon>
                                            <Hub />
                                        </ListItemIcon>
                                        <ListItemText primary="Cluster" />
                                    </Box>
                                    <Stack spacing={0} sx={{ width: '90%', mt: 1, ml: 2, mr: 2 }}>
                                        <Typography fontSize={12} >GPU POWER: {(totals.total_power_draw).toFixed(0)} W / {(totals.total_power_limit).toFixed(0)} W</Typography>
                                        {/* <LinearProgress variant="determinate" color="secondary" value={powerUsagePerc} /> */}
                                        <Typography fontSize={12} >GPU MEMORY: {(totals.total_memory_used / 1024).toFixed(0)} GB / {(totals.total_memory_total / 1024).toFixed(0)} GB</Typography>
                                        {/* <LinearProgress variant="determinate" color="success" value={memUsagePerc} /> */}
                                    </Stack>
                                </ListItemButton>

                                <ListItemButton
                                    key={'connectServer'}
                                    component={Link} sx={{ ...tabStyle, pl: 4 }}
                                    to={`/connect-server`}
                                >
                                    <ListItemIcon><Add /></ListItemIcon>
                                    <ListItemText primary={'Add Server'} />
                                </ListItemButton>
                            </>
                        )}

                        {combinedServers.map((server, index) => {
                            const isDisconnected = server.disconnected;
                            const totals = isDisconnected ? { total_memory_used: 0, total_memory_total: 0, total_power_draw: 0, total_power_limit: 0 } : calcUsageTotal([server]);
                            const memUsagePerc = isDisconnected ? 0 : Math.round(parseInt(totals.total_memory_used) / parseInt(totals.total_memory_total) * 100);
                            const powerUsagePerc = isDisconnected ? 0 : Math.round(parseInt(totals.total_power_draw) / parseInt(totals.total_power_limit) * 100);
                            return (
                                <ListItemButton
                                    selected={pathSegments[2] === encodeURIComponent(server.url)}
                                    key={index} to={`/cluster/${encodeURIComponent(server.url)}`}
                                    component={Link} sx={{ ...tabStyle, pl: 4, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                        {server?.devices && <ListItemIcon>
                                            <Tooltip title={server?.devices?.map(device => device.queue.map(q => {
                                                const timeLeft = ((+new Date() - q.timeStarted)/1000).toFixed(2);
                                                return (
                                                    <div id={timeLeft}>
                                                        {timeLeft} s&nbsp;&nbsp;
                                                        {q.pipeId}
                                                    </div>
                                                )
                                            }))}>
                                                <Badge badgeContent={totals.total_queue_tasks} color="primary">

                                                </Badge>
                                            </Tooltip>
                                            <Server />
                                        </ListItemIcon>}

                                        {isDisconnected && <ListItemIcon><LinkOff style={{color: 'red'}} /></ListItemIcon>  }

                                        <ListItemText primary={<Typography fontSize={12}>{server.url}</Typography>}/>

                                        <IconButton
                                            sx={{
                                                position: 'absolute',
                                                bottom: 0,
                                                right: 0,
                                                zIndex: 100
                                            }}
                                            aria-label="delete"
                                        >
                                            {server.url !== baseAPIUrl && <Delete fontSize={"small"} onClick={() => {
                                                if (window.confirm("Are you sure you want to delete " + server.url)) {
                                                    APIRequest('post', baseAPIUrl + 'removeConnection', {url: server.url}).then((data) => {
                                                        if (data?.data?.success) {
                                                            window.location.replace('/');
                                                            APIRequest('get', baseAPIUrl + 'restartServer')
                                                            setTimeout(() => window.location.reload(),1000)
                                                        }
                                                    });
                                                }
                                            }}/>}
                                        </IconButton>

                                    </Box>
                                    <Stack spacing={0} sx={{ width: '80%', mt: 1 }}>
                                        <Typography fontSize={8} >{(totals.total_power_draw).toFixed(0)} W / {(totals.total_power_limit).toFixed(0)} W</Typography>
                                        <LinearProgress variant="determinate" color="secondary" value={powerUsagePerc} />
                                        <Typography fontSize={8}>{(totals.total_memory_used / 1024).toFixed(0)} GB / {(totals.total_memory_total / 1024).toFixed(0)} GB</Typography>
                                        <LinearProgress variant="determinate" color="success" value={memUsagePerc} />
                                    </Stack>
                                </ListItemButton>
                            )
                        })}

                        {serverConnections?.filter(o => o.status === 'REQUESTED').map((serverConnection, index) => (
                            <React.Fragment key={index}>
                                <ListItemButton
                                    selected={pathSegments[2] === encodeURIComponent(serverConnection.url)}
                                    key={index} to={`/connection-grant/${encodeURIComponent(serverConnection.url)}`}
                                    component={Link} sx={{ ...tabStyle, pl: 4 }}>
                                    <ListItemIcon>
                                        <QuestionMark />
                                    </ListItemIcon>
                                    <ListItemText primary={serverConnection.url} />
                                </ListItemButton>
                            </React.Fragment>
                        ))}
                    </List>

                </Box>
            </Drawer>
            <Box
                sx={{
                    backgroundColor: theme => theme.palette.background.default,
                    minHeight: windowHeight - 136, // 136 is magic number to avoid scrollbar
                    flexGrow: 1,
                    p: 3,
                    // marginTop: 17,
                    paddingTop: 14,
                }}
            >

                <Box sx={{
                    transition: 'margin-left 0.2s', ...(open && {
                        marginLeft: `${drawerWidth}px`,
                    })
                }}
                >

                    <AlertContext.Provider value={{ systemAlert, setSystemAlert }}>
                        <Snackbar
                            style={{ zIndex: 10000 }}
                            autoHideDuration={systemAlert?.duration || 6000}
                            anchorOrigin={{ vertical: systemAlert?.vertical || 'top', horizontal: systemAlert?.horizontal || 'right' }}
                            open={!!systemAlert?.msg}
                            onClose={(prev) => setSystemAlert({ ...prev, msg: '' })}
                        >
                            {systemAlert?.msg && <Alert
                                onClose={systemAlert.onClose !== undefined ? systemAlert.onClose : (prev) => setSystemAlert({ ...prev, msg: '' })}
                                severity={systemAlert.type}
                                sx={{ width: '100%', minWidth: '200px', marginTop: systemAlert?.marginTop || '50px' }}>
                                {typeof systemAlert?.msg === 'string' ? systemAlert.msg : JSON.stringify(systemAlert.msg)}
                            </Alert>}
                        </Snackbar>


                        <Routes>
                            <Route exact path="/cluster/:serverUrl" element={<ServerPage clusterState={clusterState} />} />
                            <Route exact path="/register" element={<RegisterUser baseAPIUrl={baseAPIUrl} />} />
                            <Route exact path="/connection-grant/:serverUrl" element={<ConnectionGrant baseAPIUrl={baseAPIUrl} {...{ setServerConnections, serverConnections }} />} />
                            <Route exact path="/login" element={<LoginUser baseAPIUrl={baseAPIUrl} />} />
                            <Route exact path="/connect-server" element={<ConnectServer baseAPIUrl={baseAPIUrl} />} />
                        </Routes>


                    </AlertContext.Provider>

                </Box>

            </Box>
        </APIContext.Provider>
    </div>);
}

export default App;