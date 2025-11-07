// src/components/common/Card.tsx
import React from "react";
import { View, Text, StyleSheet, ViewStyle, Platform } from "react-native"; // ← add Platform
import { useThemeStyles } from "../../styles/theme";

interface CardProps {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export const Card: React.FC<CardProps> = ({ title, children, style }) => {
  const { colors } = useThemeStyles();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.card, style]}>
      {title && <Text style={styles.title}>{title}</Text>}
      {children}
    </View>
  );
};

const makeStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      width: "100%",
      backgroundColor: colors.backgroundAlt,
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,

      
      ...(Platform.OS === "ios"
        ? {
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
          }
        : {
            elevation: 0,
            borderWidth: 1,
            borderColor: colors.border,
          }),
    },
    title: {
      fontWeight: "700",
      fontSize: 18,
      marginBottom: 16,
      color: colors.textPrimary,
      textAlign: "center",
    },
  });