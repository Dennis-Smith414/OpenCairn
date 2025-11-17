// src/screens/FileManagerScreen.tsx
import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useThemeStyles } from "../styles/theme";
import { createGlobalStyles } from "../styles/globalStyles";
import { useOfflineBackend } from "../context/OfflineContext";

export default function FileManagerScreen() {
  const { colors } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { mode, setMode } = useOfflineBackend();

  return (
    <View style={[styles.screen]}>
      <View style={globalStyles.filesContainer}>
        <View style={globalStyles.placeholderContainer}>
          <Text style={globalStyles.icon}>📁</Text>
          <Text style={globalStyles.pageTitle}>File Manager</Text>
          <Text style={globalStyles.subtitle}>
            Manage your GPX files and route data
          </Text>
          <Text style={globalStyles.comingSoon}>Coming Soon</Text>

          {/* Backend mode selector */}
          <View style={styles.modeSection}>
            <Text style={styles.modeLabel}>Backend Mode</Text>

            <View style={styles.modeRow}>
              <ModeChip
                label="Online"
                value="online"
                active={mode === "online"}
                onPress={() => setMode("online" as any)}
                colors={colors}
              />
              <ModeChip
                label="Offline"
                value="offline"
                active={mode === "offline"}
                onPress={() => setMode("offline" as any)}
                colors={colors}
              />
              <ModeChip
                label="Auto"
                value="auto"
                active={mode === "auto"}
                onPress={() => setMode("auto" as any)}
                colors={colors}
              />
            </View>

            <Text style={styles.modeHint}>
              Current: {mode.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

type ModeChipProps = {
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
  colors: any;
};

function ModeChip({ label, active, onPress, colors }: ModeChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        chipStyles.base,
        { borderColor: colors.border || "#ccc" },
        active && {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
      ]}
    >
      <Text
        style={[
          chipStyles.label,
          { color: active ? "#fff" : colors.text },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// local styles that depend on theme colors
const createStyles = (colors: any) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modeSection: {
      marginTop: 24,
      alignItems: "center",
      width: "100%",
    },
    modeLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
    },
    modeRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
    },
    modeHint: {
      fontSize: 13,
      color: colors.muted || "#777",
      marginTop: 4,
    },
  });

const chipStyles = StyleSheet.create({
  base: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
});
