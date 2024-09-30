import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, TextField, Dialog, DialogContent, DialogTitle, Typography, Backdrop, CircularProgress } from '@mui/material';
import { APIRequest } from '../API/APIRequest';

export const ConnectionGrant = ({baseAPIUrl, serverConnections}) => {
  let serverUrl = useParams().serverUrl;
  if (!serverUrl.endsWith('/')) serverUrl += '/'
  
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);

  const connectionRequest = serverConnections?.find(o => o.url === serverUrl && o.status === 'REQUESTED');
  if (!connectionRequest) return null;

  const {url, permissions} = connectionRequest;

  const handleSubmit = (e) => {
    e.preventDefault();
    
    APIRequest('post', baseAPIUrl + 'grantConnection', {url}).then((data) => {
        if (data?.data?.success) {
          window.location.replace('/');
          APIRequest('get', baseAPIUrl + 'restartServer')
          setTimeout(() => window.location.reload(),1000)
        }
    });    
  };

  const handleReject = (e) => {
    e.preventDefault();
    
    APIRequest('post', baseAPIUrl + 'rejectConnection', {url}).then((data) => {
      if (data?.data?.success) {
          window.location.replace('/');
      }
    });    
  };

  return (
    <div>
      <Dialog open={open} onClose={() => window.location.replace('/')} style={{ zIndex: 10001 }}>
        <DialogTitle>Remote server requests for permissions</DialogTitle>
        
        <DialogContent>
        <Typography color="error">If you did not initiate this request or it is not from a trusted source, please REJECT IMMEDIATELY.</Typography>
          <form onSubmit={handleSubmit}>
            <TextField
              required
              fullWidth
              autoFocus
              disabled
              margin="normal"
              label="Remote Server URL"
              value={url}
            />            
            <TextField
              disabled
              required
              fullWidth
              margin="normal"
              label="Permissions Requested"
              value={JSON.stringify(permissions, null, 4)}
              minRows={8}
              multiline
            />

            {error && <Typography color="error">{error}</Typography>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
              >
                Grant Permissions
              </Button>
              
              <Button
                type="button"
                variant="contained"
                color="primary"
                onClick={handleReject}
              >
                Reject
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