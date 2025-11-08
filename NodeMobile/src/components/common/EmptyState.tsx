// src/components/common/EmptyState.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useThemeStyles } from "../../styles/theme";

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  subtitle,
}) => {
  const { colors, isDark } = useThemeStyles();

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          alignItems: "center",
          paddingVertical: 48,
          paddingHorizontal: 24,
        },
        icon: {
          fontSize: 48,
          marginBottom: 16,
        },
        title: {
          fontSize: 18,
          fontWeight: "600",
          color: isDark ? "#FFFFFF" : colors.textPrimary,
          marginBottom: 8,
          textAlign: "center",
        },
        subtitle: {
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: "center",
        },
      }),
    [colors, isDark]
  );

  return (
    <View style={styles.container}>
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
};