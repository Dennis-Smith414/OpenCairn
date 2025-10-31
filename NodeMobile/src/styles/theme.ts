// src/styles/theme.ts
import { Platform } from "react-native";

// 1. COLORS
export const colors = {
  primary: "#40E0D0",     // turquoise
  secondary: "#008B8B",   // dark cyan
  accent: "#5F9EA0",      // cadet blue

  background: "#FFFFFF",
  backgroundAlt: "#F8F9FA", // Light gray background for cards/sections

  textPrimary: "#222222",
  textSecondary: "#666666",
  placeholder: '#A9A9A9',
  buttonText: '#FFFFFF',

  border: '#D3D3D3',
  danger: '#DC143C', // Red for errors
  success: '#28a745',

  // Kept from your old file in case they are used
  text: "#222222",
};

// 2. FONTS
export const fonts = {
  header: {
    fontFamily: Platform.OS === 'android' ? "Comfortaa-Bold" : "Comfortaa", // for titles & headings
    fontWeight: '700' as '700',
  },
  body: {
    fontFamily: "System", // default device sans serif for readability
    fontWeight: '400' as '400',
  },
  button: {
    fontFamily: Platform.OS === 'android' ? "Comfortaa-Bold" : "Comfortaa", //for buttons and menu options
    fontWeight: '700' as '700',
  },
};

// 3. SPACING (e.g., for padding and margins)
export const spacing = {
  small: 8,
  medium: 16,
  large: 24,
  xlarge: 32,
};

// 4. FONT SIZES
export const fontSizes = {
  small: 12,
  medium: 16,
  large: 24,
  xlarge: 28, // Was 28 in your baseStyles
};

// 5. COMBINED THEME OBJECT
const theme = {
  colors,
  fonts,
  spacing,
  fontSizes,
};

export default theme;