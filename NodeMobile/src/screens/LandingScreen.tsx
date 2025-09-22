import React, { useEffect, useState } from "react"; 
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { Platform } from "react-native";
import { baseStyles} from "../styles/theme";


export default function LandingScreen({ navigation }: any) {


 


  return (
    <View style={baseStyles.container}>

      <Image
        source={require("../assets/images/OCLogoLight.png")}
        style={baseStyles.logo}
        resizeMode="contain" // 👈 scale to fit, no cropping
      />

      {/* Buttons */}
      <TouchableOpacity
        style={[baseStyles.button, baseStyles.buttonPrimary]}
        onPress={() => navigation.navigate("Login")}>
        <Text style={[baseStyles.buttonText]}>Login</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[baseStyles.button, baseStyles.buttonSecondary]}
        onPress={() => navigation.navigate("CreateAccount")}>
        <Text style={[baseStyles.buttonText]}>Create Account</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[baseStyles.button, baseStyles.buttonAccent]}
        onPress={() => navigation.navigate("Map_test")}>
          <Text style={[baseStyles.buttonText]}>Demo Map</Text>
        </TouchableOpacity>
    </View>
  );
}
