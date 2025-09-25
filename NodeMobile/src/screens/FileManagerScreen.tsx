import React from "react";
import { View, Text } from "react-native";
import { baseStyles } from "../styles/theme";

export default function FileManagerScreen() {
  return (
    <View style={baseStyles.container}>
      <Text style={baseStyles.headerText}>File Manager Screen</Text>
    </View>
  );
}
