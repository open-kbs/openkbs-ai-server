import * as React from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import {ArrowBack, ArrowLeft, Lock, LockOpen, RestartAlt} from '@mui/icons-material';
import { APIRequest } from '../API/APIRequest';
import IconButton from "@mui/material/IconButton";
import {baseAPIUrl} from "../App/App";
import Tooltip from "@mui/material/Tooltip";

export function LoadPipe({pipes, serverUrl, device, loadedPipes}) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const [selectedVendor, setSelectedVendor] = React.useState(null);

  const filteredPipes = pipes.filter(o => !loadedPipes.includes(o));

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  // const handleInstall = (vendor, model) => {
  //   APIRequest('get', serverUrl + `install/${vendor}/${model}`)
  // }

  const handleVendorClick = (vendor) => {
    setSelectedVendor(vendor);
  };

  const handleBackClick = () => {
    setSelectedVendor(null);
  };

  const handleClose = (vendor,model) => {
    setAnchorEl(null);
    setSelectedVendor(null);
  };

  const handleLoad = (pipe) => {
    APIRequest('get', serverUrl + `load/${device.deviceId}/${pipe}?async=1`)  
    setAnchorEl(null);
    setSelectedVendor(null);
  };

  const vendors = [...new Set(filteredPipes.map(pipe => pipe.split('--')[0]))];
  const selectedPipes = selectedVendor ? filteredPipes.filter(pipe => pipe.split('--')[0] === selectedVendor) : [];

  const isCurrentServer = serverUrl === baseAPIUrl;
  const style = {
      color: !isCurrentServer ? 'grey' : undefined
  }
  return (
      <>
          <Tooltip title={'Restart this device'} placement={'top'}>
              <IconButton
                  disabled={!isCurrentServer}
                  onClick={() => {
                      if (window.confirm('Are you sure you want to restart this device?')) {
                          APIRequest('get', baseAPIUrl + `restartDevice/${device.deviceId}`);
                      }
                  }}
              >
                  <RestartAlt style={style} />
              </IconButton>
          </Tooltip>

          <Tooltip title={'Disable model auto loading'} placement={'top'}>
              {device?.frozen
                  ? <IconButton disabled={!isCurrentServer}
                                onClick={() => APIRequest('get', baseAPIUrl + `unfreez/${device.deviceId}`)}>
                      <Lock style={style}/></IconButton>
                  : <IconButton disabled={!isCurrentServer}
                                onClick={() => APIRequest('get', baseAPIUrl + `freez/${device.deviceId}`)}>
                      <LockOpen style={style}/></IconButton>}
          </Tooltip>
          <br/><br/>
          <Button
              disabled={!isCurrentServer}
              variant="contained"
              style={{maxHeight: '25px'}}
              id="basic-button"
              aria-controls={Boolean(anchorEl) ? 'basic-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={Boolean(anchorEl) ? 'true' : undefined}
              onClick={handleClick}
          >
              Load Model
          </Button>
          <Menu
              style={{marginTop: '10px'}}
              id="basic-menu"
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleClose}
              MenuListProps={{
                  'aria-labelledby': 'basic-button',
              }}
          >
              {selectedVendor === null && vendors.map((vendor) => (
                  <MenuItem key={vendor} onClick={() => handleVendorClick(vendor)}>{vendor}</MenuItem>
              ))}
              {selectedVendor !== null && (
                  <div>
                      <MenuItem onClick={handleBackClick}>..</MenuItem>
                      {selectedPipes.map((pipe) => (
                          <MenuItem key={pipe}
                                    onClick={() => handleLoad(pipe)}>{pipe.split('--')[1]} ({pipe.split('--')[2]})</MenuItem>
                      ))}
                  </div>
              )}
          </Menu>
      </>
  );
}