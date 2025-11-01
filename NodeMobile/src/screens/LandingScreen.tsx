import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { Platform } from "react-native";
import { globalStyles} from '../styles/globalStyles'; // Import global styles AND theme


export default function LandingScreen({ navigation }: any) {

    return (
        <View style={globalStyles.baseContainer}>

            <Image
                source={require("../assets/images/OCLogoLight.png")}
                style={globalStyles.logo}
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