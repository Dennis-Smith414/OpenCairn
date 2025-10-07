// src/components/common/Card.tsx
import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors } from "../../styles/theme";

interface CardProps {
    title?: string;
    children: React.ReactNode;
    style?: ViewStyle;
}

export const Card: React.FC<CardProps> = ({ title, children, style }) => (
    <View style={[styles.card, style]}>
        {title && <Text style={styles.title}>{title}</Text>}
        {children}
    </View>
);

const styles = StyleSheet.create({
    card: {
        width: "100%",
        backgroundColor: colors.backgroundAlt,
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
    },
    title: {
        fontWeight: "700",
        fontSize: 18,
        marginBottom: 16,
        color: colors.text,
        textAlign: "center",
    },
});