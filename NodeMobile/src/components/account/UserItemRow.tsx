import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useThemeStyles, fonts } from "../../styles/theme";

type Props = {
  title: string;
  subtitle?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  showDivider?: boolean;
};

export const UserItemRow: React.FC<Props> = ({
  title,
  subtitle,
  onEdit,
  onDelete,
  showDivider = true,
}) => {
  const { colors } = useThemeStyles();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.row, !showDivider && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <View style={styles.actions}>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.edit}>Edit</Text>
          </TouchableOpacity>
        ) : null}
        {onDelete ? (
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.delete}>Delete</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const makeStyles = (colors: any) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,              // ✅ visible divider on dark cards
    },
    title: {
      ...fonts.body,
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,                     // ✅ bright title
    },
    subtitle: {
      ...fonts.body,
      marginTop: 2,
      fontSize: 13,
      color: colors.textSecondary,                   // ✅ softer subtitle
    },
    actions: {
      flexDirection: "row",
      gap: 14,
      marginLeft: 12,
      alignItems: "center",
    },
    edit: {
      ...fonts.body,
      fontSize: 14,
      fontWeight: "700",
      color: colors.accent,                          // ✅ themed accent
    },
    delete: {
      ...fonts.body,
      fontSize: 14,
      fontWeight: "700",
      color: "#E06767",                              // ✅ accessible red on dark bg
    },
  });