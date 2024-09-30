import React, { useState } from 'react';
import { Button, TextField, Dialog, DialogContent, DialogTitle, Typography, Backdrop, CircularProgress } from '@mui/material';
import { APIRequest } from '../API/APIRequest';

export const LoginUser = ({baseAPIUrl}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);

  const handleLogin = (e) => {

    e.preventDefault();    
    
    APIRequest('post', baseAPIUrl + 'login', {username, password}).then((data) => {
        if (data?.data?.token) {
          localStorage.setItem('userToken', data?.data?.token);    
          window.location.replace('/');
        } else {
          setError("Invalid username or password");
          return;
        }
    });    
  };

  return (
    <div>
      <Dialog open={open} onClose={() => setOpen(false)} style={{zIndex: 10001}}>
        <DialogTitle>Server Login</DialogTitle>
        <DialogContent>
          <form onSubmit={handleLogin}>
            <TextField
              required
              fullWidth
              autoFocus
              margin="normal"
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <TextField
              required
              fullWidth
              margin="normal"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <Typography color="error">{error}</Typography>}
            <Button
              type="submit"
              variant="contained"
              color="primary"
              style={{ marginTop: 16 }}
            >
              Login
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Backdrop open={open} style={{zIndex: 10000, color: '#fff', backdropFilter: 'blur(3px)'}}>
        <CircularProgress color="inherit" />
      </Backdrop>
    </div>
  );
};