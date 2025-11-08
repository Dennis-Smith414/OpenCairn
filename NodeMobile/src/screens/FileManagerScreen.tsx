import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { globalStyles, theme } from "../styles/globalStyles";

export default function FileManagerScreen() {
    return (
        <View style={[globalStyles.filesContainer]}>
            <View style={globalStyles.placeholderContainer}>
                <Text style={globalStyles.icon}>📁</Text>
                <Text style={globalStyles.title}>File Manager</Text>
                <Text style={globalStyles.subtitle}>
                    Manage your GPX files and route data
                </Text>
                <Text style={globalStyles.comingSoon}>Coming Soon</Text>
            </View>
        </View>
    );
}
