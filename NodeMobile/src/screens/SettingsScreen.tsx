import React from "react";
import { View, Text, StyleSheet, Switch, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
//import { baseStyles, colors, fonts } from "../globalStyles/theme";
import { globalStyles, theme } from '../styles/globalStyles'; // <-- NEW IMPORT
import { useDistanceUnit } from "../context/DistanceUnitContext";
import { useAuth } from "../context/AuthContext";

export default function SettingsScreen() {
  const { unit, setUnit } = useDistanceUnit();
  const navigation = useNavigation();
  const {logout} = useAuth();
  const toggleUnit = (value: boolean) => {
    setUnit(value ? "km" : "mi");
  };

  return (
    <View style={[globalStyles.container, { alignItems: "flex-start", paddingHorizontal: 24 }]}>
      {/* Back Button */}
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf: "flex-start", marginLeft: 24, marginBottom: 8 }}>
        <Text style={{ fontSize: 16, color: theme.colors.accent }}>← Back</Text>
      </TouchableOpacity>
      
      <Text style={globalStyles.header}>Settings</Text>

      <View style={globalStyles.section}>
        <View style={globalStyles.row}>
          <Text style={globalStyles.label}>Switch Distance Unit</Text>
          <Switch
            value={unit === "km"}
            onValueChange={toggleUnit}
            trackColor={{ false: "#ccc", true: theme.colors.primary }}
            thumbColor={unit === "km" ? theme.colors.secondary : "#f4f3f4"}
          />
        </View>
        <Text style={globalStyles.subLabel}>
          Currently displaying distances in{" "}
            <Text style={globalStyles.highlight}>
              {unit === "km" ? "kilometers" : "miles"}
            </Text>
            .
        </Text>
      </View>

      <TouchableOpacity
              style={[globalStyles.button, globalStyles.buttonPrimary, globalStyles.logoutButton]}
              onPress={logout}
            >
              <Text style={globalStyles.buttonText}>Log Out</Text>
            </TouchableOpacity>
    </View>
  );
}
