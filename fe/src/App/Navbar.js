import React, {useState} from 'react';
import {AppBar, Toolbar, Menu, MenuItem} from '@mui/material';
import {Box} from '@mui/material';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import {isMobile} from "./utils";
import { Logout } from '@mui/icons-material';
import { getSession } from '../User/utils';

const Navbar = ({onLogout, setOpen, open}) => {
    const [anchorEl, setAnchorEl] = useState(null);
    const menuOpen = Boolean(anchorEl);

    const handleDrawerOpenClose = () => {
        setOpen(!open);
    };

    const handleMenu = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    return (
        <AppBar position="fixed" sx={{zIndex: 10000}}>
            <Box
                sx={{
                    backgroundColor: theme => theme.palette.background.paper,
                    // minHeight: '100vh',
                }}
            >
                <Toolbar>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        onClick={handleDrawerOpenClose}
                        edge="start"
                        sx={{mr: 2}}
                    >
                        <MenuIcon/>
                    </IconButton>
                    <Box sx={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>                        
                        {isMobile ? '' : getSession()}
                        <IconButton onClick={() => {
                            localStorage.setItem('userToken', '');
                            window.location.replace('/login');
                            return;
                        }}><Logout /></IconButton>
                        {/* <Avatar alt="User" src={picture} onClick={handleMenu} style={{cursor: 'pointer', marginLeft: '16px'}}/> */}
                    </Box>
                    <Menu
                        anchorEl={anchorEl}
                        open={menuOpen}
                        onClose={handleClose}
                        onClick={handleClose}
                    >
                        {/* Add additional menu items here */}
                        <MenuItem onClick={() => {}}>User Profile</MenuItem>
                        <MenuItem onClick={onLogout}>Logout</MenuItem>
                    </Menu>
                </Toolbar>
            </Box>
        </AppBar>
    );
};

export default Navbar;

