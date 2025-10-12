import React, { ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation } from "react-native";
import { colors } from "../../styles/theme";
import { Card } from "../common/Card";

interface AccountSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export const AccountSection: React.FC<AccountSectionProps> = ({
  title,
  expanded,
  onToggle,
  children,
}) => {
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

      {expanded && <View style={styles.content}>{children}</View>}
    </Card>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  arrow: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.accent,
  },
  content: {
    marginTop: 8,
  },
});
