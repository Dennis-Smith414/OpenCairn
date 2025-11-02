// components/account/AccountSection.tsx
import React, { ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  TextInput,
} from "react-native";
import { useThemeStyles, fonts } from "../../styles/theme";
import { Card } from "../common/Card";

export type DatePreset = "all" | "7" | "30" | "365";

interface AccountSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;

  showSearch?: boolean;
  searchPlaceholder?: string;
  query?: string;
  onQueryChange?: (q: string) => void;

  showDatePresets?: boolean;
  datePreset?: DatePreset;
  onDatePresetChange?: (p: DatePreset) => void;
}

export const AccountSection: React.FC<AccountSectionProps> = ({
  title,
  expanded,
  onToggle,
  children,
  showSearch = false,
  searchPlaceholder = "Search…",
  query = "",
  onQueryChange,
  showDatePresets = false,
  datePreset = "all",
  onDatePresetChange,
}) => {
  const { colors: c } = useThemeStyles();

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingVertical: 4,
        },
        title: {
          ...fonts.header,
          fontSize: 18,
          fontWeight: "700",
          color: c.textPrimary, // high contrast in dark mode
        },
        arrow: {
          fontSize: 18,
          fontWeight: "700",
          color: c.textSecondary, // subtle but readable
        },
        content: { marginTop: 8 },
        filtersRow: { gap: 8 },
        search: {
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 8,
          color: c.textPrimary,
          backgroundColor: c.background, // keeps input readable on dark
        },
        presetRow: {
          flexDirection: "row",
          gap: 8,
          marginTop: 6,
        },
        presetChip: {
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 14,
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: "transparent",
        },
        presetChipActive: {
          backgroundColor: c.accent,
          borderColor: c.accent,
        },
        presetText: {
          color: c.textSecondary,
          fontWeight: "600",
        },
        presetTextActive: {
          color: c.background,
          fontWeight: "700",
        },
      }),
    [c]
  );

  return (
    <Card>
      <TouchableOpacity
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggle();
        }}
        activeOpacity={0.8}
        style={styles.header}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.arrow}>{expanded ? "▼" : "▶"}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.content}>
          {(showSearch || showDatePresets) && (
            <View style={styles.filtersRow}>
              {showSearch && (
                <TextInput
                  value={query}
                  onChangeText={(t) => onQueryChange?.(t)}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={c.textSecondary}
                  style={styles.search}
                  returnKeyType="search"
                />
              )}

              {showDatePresets && (
                <View style={styles.presetRow}>
                  {(["all", "7", "30", "365"] as DatePreset[]).map((p) => {
                    const label =
                      p === "all" ? "All" : p === "7" ? "7d" : p === "30" ? "30d" : "Year";
                    const active = datePreset === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => onDatePresetChange?.(p)}
                        style={[styles.presetChip, active && styles.presetChipActive]}
                      >
                        <Text style={[styles.presetText, active && styles.presetTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          <View style={{ marginTop: showSearch || showDatePresets ? 8 : 0 }}>
            {children}
          </View>
        </View>
      )}
    </Card>
  );
};
