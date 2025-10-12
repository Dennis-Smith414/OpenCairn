// src/components/account/UserItemRow.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../../styles/theme";

interface UserItemRowProps {
  title: string;
  subtitle?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const UserItemRow: React.FC<UserItemRowProps> = ({
  title,
  subtitle,
  onEdit,
  onDelete,
}) => (
  <View style={styles.row}>
    <View style={styles.info}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
    <View style={styles.actions}>
      {onEdit && (
        <TouchableOpacity onPress={onEdit}>
          <Text style={styles.edit}>Edit</Text>
        </TouchableOpacity>
      )}
      {onDelete && (
        <TouchableOpacity onPress={onDelete}>
          <Text style={styles.delete}>Delete</Text>
        </TouchableOpacity>
      )}
    </View>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || "#ddd",
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    gap: 16,
  },
  edit: {
    color: colors.accent,
    fontWeight: "700",
  },
  delete: {
    color: "#d9534f",
    fontWeight: "700",
  },
});
