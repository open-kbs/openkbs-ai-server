import React, { useState } from 'react';
import { Button, TextField, Dialog, DialogContent, DialogTitle, Typography, Backdrop, CircularProgress } from '@mui/material';
import { APIRequest } from '../API/APIRequest';

export const ConnectServer = ({ baseAPIUrl }) => {
  const [url, setUrl] = useState(baseAPIUrl);
  const [remoteUrl, setRemoteUrl] = useState('https://remote_server:port/');
  const [permissionGranted, setPermissionGranted] = useState(JSON.stringify({ fullPermissions: true }, null, 4));
  const [permissionRequested, setPermissionRequested] = useState(JSON.stringify({ fullPermissions: true }, null, 4));
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);
  const [restartNeeded, setRestartNeeded] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();

    let payload;

    try {
      payload = { 
        url, 
        remoteUrl,
        permissionGranted: JSON.parse(permissionGranted), 
        permissionRequested: JSON.parse(permissionGranted), 
      };
    } catch (e) {
      alert('Invalid JSON permissions')
    }

    APIRequest('post', baseAPIUrl + 'requestConnection', payload).then((data) => {
      if (data?.data?.success) window.location.replace('/')
      APIRequest('get', baseAPIUrl + 'restartServer')
      setTimeout(() => window.location.reload(),1000)
    });  
  };
  const backendPort = process.env.REACT_APP_BACKEND_PORT || '8080';

  return (
    <div>
      <Dialog open={open} onClose={() => window.location.replace('/')} style={{ zIndex: 10001 }}>
        <DialogTitle>Connect remote server</DialogTitle>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <TextField
              required
              fullWidth
              autoFocus
              margin="normal"
              label="Public Server URL (this server)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <TextField
              required
              fullWidth
              autoFocus
              margin="normal"
              label="Remote Server URL (remote server)"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
            />
            <TextField
              required
              fullWidth
              margin="normal"
              label="Permissions Granted (permissions this server grants to remote server)"
              value={permissionGranted}
              minRows={8}
              multiline
              onChange={(e) => setPermissionGranted(e.target.value)}
            />

            <TextField
              required
              fullWidth
              margin="normal"
              label="Permissions Requested (permissions this server requests from remote server)"
              value={permissionRequested}
              minRows={8}
              multiline
              onChange={(e) => setPermissionRequested(e.target.value)}
            />
            {error && <Typography color="error">{error}</Typography>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
              >
                Connect
              </Button>
              <Button
                type="button"
                onClick={() => window.location.replace('/')}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Backdrop open={open} style={{ zIndex: 10000, color: '#fff', backdropFilter: 'blur(3px)' }}>
        <CircularProgress color="inherit" />
      </Backdrop>
    </div>
  );
};