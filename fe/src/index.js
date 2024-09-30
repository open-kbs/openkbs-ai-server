import { Buffer } from 'buffer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App/App.js';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';
import theme from './App/theme.js';
import { ThemeProvider } from '@mui/material/styles';


window.Buffer = Buffer;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
reportWebVitals();
