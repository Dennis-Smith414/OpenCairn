import React, { useEffect, useState } from "react"; 
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { Platform } from "react-native"; 


export default function LandingScreen({ navigation }: any) {


 


  return (
    <View style={styles.container}>
      {/* Fullscreen-fitting Image */}
      <Image
        source={require("../assets/images/OCLogoLight.png")}
        style={styles.logo}
        resizeMode="contain" // 👈 scale to fit, no cropping
      />

      {/* Buttons */}
      <TouchableOpacity
        style={[styles.button, styles.loginButton]}
        onPress={() => navigation.navigate("Login")}
      >
        <Text style={styles.buttonText}>Login</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.createButton]}
        onPress={() => navigation.navigate("CreateAccount")}
      >
        <Text style={styles.buttonText}>Create Account</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.map_test_button]}
        onPress={() => navigation.navigate("Map_test")}
        >
          <Text style={styles.buttonText}>Demo Map</Text>
        </TouchableOpacity>
          

        
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center", // keep image centered
    alignItems: "center",
    backgroundColor: "#fff",
  },
  logo: {
    flex: 0.6,               // take up all available vertical space
    width: "80%",         // span full width
  },
  button: {
    width: "60%",          // smaller buttons
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: "center",
    marginVertical: 6,
  },
  loginButton: {
    backgroundColor: "#40e0d0", // turquoise
  },
  createButton: {
    backgroundColor: "#008b8b", // dark cyan
  },
  map_test_button: { // for Map test button
    backgroundColor: "#5f9ea0",
    color: "#ffffff",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
    debugText: {
    marginTop: 10,
    color: "#666",
    fontSize: 12,
  },
});
