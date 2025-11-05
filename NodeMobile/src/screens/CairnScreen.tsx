import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { baseStyles, colors } from "../styles/theme";

/**
 * CairnScreen - Waypoint management screen
 * Place holder currently
 */
export default function CairnScreen() {
    return (
        <View style={[baseStyles.container, styles.container]}>
            <View style={styles.placeholderContainer}>
                <Text style={styles.icon}>🗿</Text>
                <Text style={styles.title}>Cairns</Text>
                <Text style={styles.subtitle}>
                    Create and manage waypoints along your trails
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