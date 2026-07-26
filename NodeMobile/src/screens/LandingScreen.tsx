import React from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { useThemeStyles } from '../styles/theme';
import { createGlobalStyles } from '../styles/globalStyles';


export default function LandingScreen({ navigation }: any) {
    // Was importing the STATIC globalStyles, which is createGlobalStyles(lightColors)
    // — so the landing screen was hardcoded light while every other screen builds
    // its styles from the active theme. Match the standard pattern.
    const { colors } = useThemeStyles();
    const globalStyles = createGlobalStyles(colors);

    return (
        <View style={globalStyles.container}>

            <Image
                source={require("../assets/images/OCLogoLight.png")}
                style={styles.logo}
                resizeMode="contain" // scaled to fit
            />

            {/* Buttons */}
            <TouchableOpacity
                testID="landing-login-button"
                style={[globalStyles.button, globalStyles.buttonPrimary]}
                onPress={() => navigation.navigate("Login")}>
                <Text style={[globalStyles.buttonText]}>Login</Text>
            </TouchableOpacity>

            <TouchableOpacity
                testID="landing-create-account-button"
                style={[globalStyles.button, globalStyles.buttonSecondary]}
                onPress={() => navigation.navigate("CreateAccount")}>
                <Text style={[globalStyles.buttonText]}>Create Account</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    logo: {
        flex: .6,
        width: "80%", // span full width
    },
    });