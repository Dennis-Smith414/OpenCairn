// src/components/common/EmptyState.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../styles/theme";

interface EmptyStateProps {
    icon?: string;
    title: string;
    subtitle?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
                                                          icon,
                                                          title,
                                                          subtitle
                                                      }) => (
    <View style={styles.container}>
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
);

const styles = StyleSheet.create({
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
        color: colors.text,
        marginBottom: 8,
        textAlign: "center",
    },
    subtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: "center",
    },
});