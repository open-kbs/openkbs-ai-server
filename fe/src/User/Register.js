import React, { useState } from 'react';
import { Button, TextField, Dialog, DialogContent, DialogTitle, Typography, Backdrop, CircularProgress } from '@mui/material';
import { APIRequest } from '../API/APIRequest';

export const RegisterUser = ({baseAPIUrl}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);

  const handleRegister = (e) => {

    e.preventDefault();
    
    if (password !== password2) {
      setError("Passwords do not match");
      return;
    }
    const strongPassword = new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})");

    if (!strongPassword.test(password)) {
      setError("Password is not strong enough");
      return;
    }
    
    
    APIRequest('post', baseAPIUrl + 'registerUser', {username, password, fullPermissions: true}).then((data) => {
        if (data?.data?.registered) {
            window.location.replace('/login');
        }

    });    
  };

  return (
    <div>
      <Dialog open={open} onClose={() => setOpen(false)} style={{zIndex: 10001}}>
        <DialogTitle>Register Administrator</DialogTitle>
        <DialogContent>
          <form onSubmit={handleRegister}>
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
            <TextField
              required
              fullWidth
              margin="normal"
              label="Confirm Password"
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
            {error && <Typography color="error">{error}</Typography>}
            <Button
              type="submit"
              variant="contained"
              color="primary"
              style={{ marginTop: 16 }}
            >
              Register
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