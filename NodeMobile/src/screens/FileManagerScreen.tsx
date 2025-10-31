import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { globalStyles, theme } from "../styles/globalStyles";

export default function FileManagerScreen() {
    return (
        <View style={[baseStyles.container, styles.container]}>
            <View style={styles.placeholderContainer}>
                <Text style={styles.icon}>📁</Text>
                <Text style={styles.title}>File Manager</Text>
                <Text style={styles.subtitle}>
                    Manage your GPX files and route data
                </Text>
                <Text style={styles.comingSoon}>Coming Soon</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
    },
    placeholderContainer: {
        alignItems: "center",
        maxWidth: 300,
    },
    icon: {
        fontSize: 64,
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: "center",
        marginBottom: 24,
    },
    comingSoon: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.accent,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
});