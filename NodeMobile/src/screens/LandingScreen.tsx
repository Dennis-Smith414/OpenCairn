import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { Platform } from "react-native";
//import { globalStyles } from '../styles/globalStyles';
import { globalStyles, theme } from '../styles/globalStyles'; // <-- NEW IMPORT


export default function LandingScreen({ navigation }: any) {

    return (
        <View style={globalStyles.container}>

            <Image
                source={require("../assets/images/OCLogoLight.png")}
                style={styles.logo}
                resizeMode="contain" // scaled to fit
            />

            {/* Buttons */}
            <TouchableOpacity
                style={[globalStyles.button, globalStyles.buttonPrimary]}
                onPress={() => navigation.navigate("Login")}>
                <Text style={[globalStyles.buttonText]}>Login</Text>
            </TouchableOpacity>

            <TouchableOpacity
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