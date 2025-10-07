// src/components/common/StatRow.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../styles/theme";

interface StatRowProps {
    label: string;
    value: string | number;
    showBorder?: boolean;
}

export const StatRow: React.FC<StatRowProps> = ({
                                                    label,
                                                    value,
                                                    showBorder = true
                                                }) => (
    <View style={[styles.container, showBorder && styles.bordered]}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
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
        fontWeight: "600",
        color: colors.text,
    },
});