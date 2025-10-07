import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { baseStyles, colors } from "../styles/theme";

interface UserStats {
    cairnsCreated: number;
    commentsWritten: number;
    ratingsGiven: number;
    memberSince: string;
}

interface UserProfile {
    username: string;
    email: string;
    stats: UserStats;
}

export default function AccountScreen({ navigation }: { navigation: any }) {
    // TODO: Replace with real user data from context/API
    const user: UserProfile = {
        username: "DemoUser",
        email: "demo@example.com",
        stats: {
            cairnsCreated: 12,
            commentsWritten: 14,
            ratingsGiven: 34,
            memberSince: "August 9, 2025",
        },
    };

    const handleLogout = () => {
        // TODO: Clear auth tokens, reset context
        navigation.navigate("Landing");
    };

    const renderStatRow = (label: string, value: string | number) => (
        <View style={styles.statRow}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
        </View>
    );

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Account Information Card */}
            <View style={styles.card}>
                <Text style={styles.cardHeader}>My Account</Text>
                {renderStatRow("Username", user.username)}
                {renderStatRow("Email", user.email)}
            </View>

            {/* Profile Statistics Card */}
            <View style={styles.card}>
                <Text style={styles.cardHeader}>Profile Statistics</Text>
                {renderStatRow("Cairns created", user.stats.cairnsCreated)}
                {renderStatRow("Comments written", user.stats.commentsWritten)}
                {renderStatRow("Ratings given", user.stats.ratingsGiven)}
                {renderStatRow("Member since", user.stats.memberSince)}
            </View>

            {/* Logout Button */}
            <TouchableOpacity
                style={[baseStyles.button, baseStyles.buttonPrimary, styles.logoutButton]}
                onPress={handleLogout}
            >
                <Text style={baseStyles.buttonText}>Log Out</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        padding: 24,
        alignItems: "center",
    },
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
    cardHeader: {
        fontWeight: "700",
        fontSize: 18,
        marginBottom: 16,
        color: colors.text,
        textAlign: "center",
    },
    statRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    statLabel: {
        fontSize: 15,
        color: colors.textSecondary,
    },
    statValue: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.text,
    },
    logoutButton: {
        width: "100%",
        marginTop: 8,
    },
});