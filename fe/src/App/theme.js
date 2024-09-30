import { createTheme } from '@mui/material/styles';
import {isMobile} from "./utils.js";

const white = '#e7e7e7';

export const colorIcon = white;
export const colorText = white;
export const colorPaper = '#2B2B2B';
export const colorBox = '#363636';
export const colorWarningBackground = colorPaper;

export const mobileButton = {
    width: (isMobile ? "100%": "250px"), marginTop: '8px'
};
export const styleSecondaryButton = {
    borderColor: "gray",
    color: "gray",
    '&:hover': {
        borderColor: "white",
    },
};

export const colorEasyRed = '#FF8A80';
export const colorEasyGreen = '#80FF8A';

export const colorEasyRed2 = '#ff5347';


export const errorColor = colorEasyRed;

export const colorSecondary = '#BB86FC';
export const colorSecondaryLight = '#cdacea';
export const colorCodeEditorPrimary = '#588dcc';


export const backgroundColor = '#1E1E1E';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: white, // Dark gray color
        },
        secondary: {
            main: colorSecondary, // Accent color - light purple
        },
        background: {
            default: backgroundColor, // Dark background color
            paper: colorPaper, // Paper color for cards and dialogs
        },
        text: {
            primary: white, // White color for text
        },
    },
    components: {
        MuiTab: {
            defaultProps: {
                disableRipple: true,
            },
        },
        MuiButtonBase: { // ButtonBase is the foundation for many MUI components including Button
            defaultProps: {
                // disableRipple: true
            }
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: '#4A4A4A', // Dark gray color for the AppBar
                },
            },
        },
        MuiSvgIcon: {
            styleOverrides: {
                root: {
                    color: white,
                    // backgroundColor: '#4A4A4A',
                },
            },
        },
    },
});

export default theme;
