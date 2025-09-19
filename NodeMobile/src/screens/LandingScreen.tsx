import React from "react";
import { View, Text, StyleSheet, Button } from "react-native";

export default function LandingScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to NodeMobile 🚀</Text>
      <Text style={styles.subtitle}>Your capstone app starts here.</Text>

      <Button
        title="Go to App"
        onPress={() => navigation.navigate("Home")} // 👈 assumes you’ll make a HomeScreen later
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "bold", marginBottom: 12 },
  subtitle: { fontSize: 16, color: "#555", marginBottom: 20 },
});
