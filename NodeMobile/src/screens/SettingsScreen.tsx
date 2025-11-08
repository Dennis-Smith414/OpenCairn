import React from "react";
import { View, Text, Switch, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useThemeStyles, useThemeOverride, setThemeOverride } from "../styles/theme";
import { createGlobalStyles } from '../styles/globalStyles';
import { useDistanceUnit } from "../context/DistanceUnitContext";
import { useAuth } from "../context/AuthContext";

export default function SettingsScreen() {
  const { colors } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);
  const themeOverride = useThemeOverride();
  const { isDark } = useThemeStyles();

  const { unit, setUnit } = useDistanceUnit();
  const navigation = useNavigation();
  const { logout } = useAuth();
  const toggleUnit = (value: boolean) => setUnit(value ? "km" : "mi");

  // Dark Mode switch: ON = force dark, OFF = follow system
  const darkSwitchValue = themeOverride === "dark";
  const onToggleDark = (val: boolean) => setThemeOverride(val ? "dark" : "system");

  return (
    <View style={[globalStyles.container, { alignItems: "flex-start", paddingHorizontal: 24 }]}>
      {/* Back Button */}
      <TouchableOpacity 
        onPress={() => navigation.goBack()} 
        style={{ alignSelf: "flex-start", marginLeft: 24, marginBottom: 8 }}
      >
        <Text style={{ fontSize: 16, color: colors.accent }}>← Back</Text>
      </TouchableOpacity>

      <Text style={globalStyles.header}>Settings</Text>

      {/* Distance Unit */}
      <View style={globalStyles.section}>
        <View style={globalStyles.row}>
          <Text style={globalStyles.label}>Switch Distance Unit</Text>
          <Switch
            value={unit === "km"}
            onValueChange={toggleUnit}
            trackColor={{ false: "#ccc", true: colors.primary }}
            thumbColor={unit === "km" ? colors.secondary : "#f4f3f4"}
          />
        </View>
        <Text style={globalStyles.subLabel}>
          Currently displaying distances in{" "}
          <Text style={globalStyles.highlight}>
            {unit === "km" ? "kilometers" : "miles"}
          </Text>
          .
        </Text>
      </View>

      {/* Appearance (single toggle) */}
      <View style={[globalStyles.section, { marginTop: 16 }]}>
        <View style={globalStyles.row}>
          <Text style={globalStyles.label}>Dark Mode</Text>
          <Switch
            value={darkSwitchValue}
            onValueChange={onToggleDark}
            trackColor={{ false: "#ccc", true: colors.primary }}
            thumbColor={darkSwitchValue ? colors.secondary : "#f4f3f4"}
          />
        </View>
        <Text style={globalStyles.subLabel}>
          {darkSwitchValue
            ? "Forced dark theme is ON."
            : `Following system theme (${isDark ? "dark" : "light"}).`}
        </Text>
      </View>

      <TouchableOpacity
        style={[globalStyles.button, globalStyles.buttonPrimary, globalStyles.logoutButton]}
        onPress={logout}
      >
        <Text style={globalStyles.buttonText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}