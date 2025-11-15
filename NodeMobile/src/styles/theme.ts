// src/styles/theme.ts
import React from "react";
import { StyleSheet, Appearance, useColorScheme, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** ---------- Override store (no Provider needed) ---------- */
export type ThemeOverride = "system" | "light" | "dark";
let __override: ThemeOverride = "system";
const __listeners = new Set<() => void>();
const STORAGE_KEY = "@theme_override"; // persisted: "system" | "light" | "dark"

export async function setThemeOverride(mode: ThemeOverride) {
  __override = mode;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
  } catch {}
  __listeners.forEach((fn) => fn());
}

export function useThemeOverride(): ThemeOverride {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force((n) => n + 1);
    __listeners.add(fn);
    return () => __listeners.delete(fn);
  }, []);
  return __override;
}

export async function loadSavedThemeOverride() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      __override = saved;
      __listeners.forEach((fn) => fn());
    }
  } catch {}
}

let __appearanceSub: { remove: () => void } | null = null;
export function startSystemThemeListener() {
  if (__appearanceSub) return;
  __appearanceSub = Appearance.addChangeListener(() => {
    if (__override === "system") {
      __listeners.forEach((fn) => fn());
    }
  });
}

/** ---------- Palettes ---------- */
type Palette = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  backgroundAlt: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  placeholder: string;
  buttonText: string;
  danger: string;
  success: string;
  text: string;
};

export const lightColors: Palette = {
  primary: "#40E0D0",
  secondary: "#008B8B",
  accent: "#40E0D0",          // ⬅ change this from "#5F9EA0"
  background: "#FFFFFF",
  backgroundAlt: "#F8F9FA",
  textPrimary: "#222222",
  textSecondary: "#666666",
  placeholder: '#A9A9A9',
  buttonText: '#FFFFFF',
  border: '#D3D3D3',
  danger: '#DC143C',
  success: '#28a745',
  text: "#222222",
};

export const darkColors: Palette = {
  primary: "#40E0D0",
  secondary: "#00A3A3",
  accent: "#40E0D0",          // ⬅ change this from "#6FB0B5"
  background: "#101214ff",
  backgroundAlt: "#1A1F23",
  textPrimary: "#EAEAEA",
  textSecondary: "#A6A6A6",
  border: "#2B3137",
  placeholder: '#A9A9A9',
  buttonText: '#FFFFFF',
  danger: '#DC143C',
  success: '#28a745',
  text: "#EAEAEA",
};


/** ---------- Fonts ---------- */
export const fonts = {
  header: {
    fontFamily: Platform.OS === 'android' ? "Comfortaa-Bold" : "Comfortaa",
    fontWeight: '700' as '700',
  },
  body: {
    fontFamily: "System",
    fontWeight: '400' as '400',
  },
  button: {
    fontFamily: Platform.OS === 'android' ? "Comfortaa-Bold" : "Comfortaa",
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
  xlarge: 28,
};

/** ---------- Style factory ---------- */
const makeBaseStyles = (c: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      alignItems: "center",
      justifyContent: "center",
    },
    logo: { flex: 0.6, width: "80%" },
    headerText: { ...fonts.header, fontSize: 28, color: c.textPrimary },
    bodyText: { ...fonts.body, fontSize: 16, color: c.textPrimary },
    subText: { ...fonts.body, fontSize: 14, color: c.textSecondary },
    button: {
      width: "70%",
      paddingVertical: 14,
      borderRadius: 30,
      alignItems: "center",
      marginVertical: 8,
    },
    buttonPrimary: { backgroundColor: c.primary },
    buttonSecondary: { backgroundColor: c.secondary },
    buttonAccent: { backgroundColor: c.accent },
    buttonText: { ...fonts.button, fontSize: 16, fontWeight: "600", color: c.buttonText },
    input: {
      ...fonts.body,
      width: "80%",
      borderWidth: 1,
      borderColor: c.accent,
      borderRadius: 12,
      padding: 12,
      marginVertical: 8,
      fontSize: 16,
      color: c.textPrimary,
      backgroundColor: c.backgroundAlt,
    },
    error: { color: c.danger, textAlign: "center", marginTop: 8 },
    card: {
      width: "90%",
      padding: 16,
      borderRadius: 16,
      backgroundColor: c.backgroundAlt,
      borderWidth: 1,
      borderColor: c.border,
    },
  });

/** ---------- Legacy defaults (light) for old imports ---------- */
export const colors = lightColors;
export const baseStyles = makeBaseStyles(lightColors);

/** ---------- Theming helpers ---------- */
// Hook for components (live-updates on override/system changes)
export function useThemeStyles(override?: "light" | "dark") {
  const _override = useThemeOverride();
  const scheme = useColorScheme();

  let mode: "light" | "dark";
  if (override) {
    mode = override;
  } else if (_override === "system") {
    const sys = (scheme ?? Appearance.getColorScheme() ?? "light") === "dark" ? "dark" : "light";
    mode = sys;
  } else {
    mode = _override;
  }

  const c = mode === "dark" ? darkColors : lightColors;
  const styles = makeBaseStyles(c);
  return { colors: c, styles, isDark: mode === "dark" };
}

// Non-hook getter (useful outside React)
export function getThemed(override?: "light" | "dark") {
  const eff = override ?? (__override === "system" ? (Appearance.getColorScheme() ?? "light") : __override);
  const c = eff === "dark" ? darkColors : lightColors;
  const styles = makeBaseStyles(c);
  return { colors: c, styles, isDark: eff === "dark" };
}

// Manual factory pinned to a given scheme
export function createThemedStyles(scheme: "light" | "dark") {
  const c = scheme === "dark" ? darkColors : lightColors;
  return makeBaseStyles(c);
}

// Legacy theme object for backward compatibility
const theme = {
  colors: lightColors,
  fonts,
  spacing,
  fontSizes,
};

export default theme;