import React from "react";
import { View, Text } from "react-native";
import { baseStyles } from "../styles/theme";

export default function MapScreen() {
  return (
    <View style={baseStyles.container}>
      <Text style={baseStyles.headerText}>Map Screen</Text>
    </View>
  );
}
