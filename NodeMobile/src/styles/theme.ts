// src/styles/theme.ts
// Remove StyleSheet import if no longer needed here
// import { StyleSheet } from "react-native";

export const colors = {
  primary: "#40E0D0",     // turquoise
  secondary: "#008B8B",   // dark cyan
  accent: "#5F9EA0",      // cadet blue
  background: "#FFFFFF",
  backgroundAlt: "#F8F9FA",
  textPrimary: "#222222",
  textSecondary: "#666666",
  placeholder: '#A9A9A9',
  danger: '#DC143C',
  border: '#D3D3D3',
  inputBackground: '#FFFFFF',
  buttonText: '#FFFFFF',
  text: '#222222', // Assuming textPrimary is the default text color
};

export const fonts = {
  header: {
    fontFamily: "Comfortaa-Bold", // for titles & headings
  },
  body: {
    fontFamily: "System", // default device sans serif for readability
  },
  button: {
    fontFamily: "Comfortaa-Bold", //for buttons and menu options
  },
};

export const spacing = {
  small: 8,
  medium: 30,
  large: 100,
};

export const fontSizes = {
    small: 14,
    medium: 16,
    large: 28,
};


// Combine all theme elements into a single export
const theme = {
    colors,
    fonts,
    spacing,
    fontSizes,
};

export default theme;