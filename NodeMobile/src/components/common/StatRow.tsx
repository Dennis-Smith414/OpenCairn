// src/components/common/StatRow.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useThemeStyles } from "../../styles/theme";

interface StatRowProps {
  label: string;
  value: string | number;
  showBorder?: boolean;
}

export const StatRow: React.FC<StatRowProps> = ({
  label,
  value,
  showBorder = true,
}) => {
  const { colors } = useThemeStyles();                         
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.container, showBorder && styles.bordered]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{String(value)}</Text>
    </View>
  );
};

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
    },
    bordered: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,     
    },
    label: {
      fontSize: 15,
      color: colors.textSecondary,         
    },
    value: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,          
    },
  });