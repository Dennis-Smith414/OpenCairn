import React from "react";
import { View, Text, StyleSheet, Switch, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
// ⬇️ swap static imports for the themed hook + override getters
import { useThemeStyles, useThemeOverride, setThemeOverride, fonts } from "../styles/theme";
import { useDistanceUnit } from "../context/DistanceUnitContext";
import { useAuth } from "../context/AuthContext";

export default function SettingsScreen() {
  // ⬇️ get current themed colors & baseStyles (names kept the same for 1:1 usage)
  const { colors, styles: baseStyles, isDark } = useThemeStyles();
  const themeOverride = useThemeOverride();

  const { unit, setUnit } = useDistanceUnit();
  const navigation = useNavigation();
  const { logout } = useAuth();
  const toggleUnit = (value: boolean) => setUnit(value ? "km" : "mi");

  // ⬇️ make local styles with current colors (so your existing StyleSheet keys stay identical)
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  // Dark Mode switch: ON = force dark, OFF = follow system
  const darkSwitchValue = themeOverride === "dark";
  const onToggleDark = (val: boolean) => setThemeOverride(val ? "dark" : "system");

  return (
    <View style={[baseStyles.container, { alignItems: "flex-start", paddingHorizontal: 24 }]}>
      {/* Back Button */}
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf: "flex-start", marginLeft: 24, marginBottom: 8 }}>
        <Text style={{ fontSize: 16, color: colors.accent }}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.header}>Settings</Text>

      {/* Distance Unit */}
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.label}>Switch Distance Unit</Text>
          <Switch
            value={unit === "km"}
            onValueChange={toggleUnit}
            trackColor={{ false: "#ccc", true: colors.primary }}
            thumbColor={unit === "km" ? colors.secondary : "#f4f3f4"}
          />
        </View>
        <Text style={styles.subLabel}>
          Currently displaying distances in <Text style={styles.highlight}>{unit === "km" ? "kilometers" : "miles"}</Text>.
        </Text>
      </View>

      {/* Appearance (single toggle) */}
      <View style={[styles.section, { marginTop: 16 }]}>
        <View style={styles.row}>
          <Text style={styles.label}>Dark Mode</Text>
          <Switch
            value={darkSwitchValue}
            onValueChange={onToggleDark}
            trackColor={{ false: "#ccc", true: colors.primary }}
            thumbColor={darkSwitchValue ? colors.secondary : "#f4f3f4"}
          />
        </View>
        <Text style={styles.subLabel}>
          {darkSwitchValue
            ? "Forced dark theme is ON."
            : `Following system theme (${isDark ? "dark" : "light"}).`}
        </Text>
      </View>

      <TouchableOpacity
        style={[baseStyles.button, baseStyles.buttonPrimary, styles.logoutButton]}
        onPress={logout}
      >
        <Text style={baseStyles.buttonText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---- themed styles factory (keys unchanged) ----
const makeStyles = (colors: any) =>
  StyleSheet.create({
    header: {
      ...fonts.header,
      fontSize: 28,
      marginBottom: 24,
      color: colors.textPrimary,
      alignSelf: "center",
    },
    section: {
      width: "100%",
      backgroundColor: colors.backgroundAlt,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 20,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    label: {
      ...fonts.body,
      fontSize: 18,
      color: colors.textPrimary,
    },
    subLabel: {
      ...fonts.body,
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 8,
    },
    logoutButton: {
      marginTop: 24,
      marginBottom: 60,
      alignSelf: "center",
    },
    highlight: {
      color: colors.secondary,
      fontWeight: "bold",
    },
  });