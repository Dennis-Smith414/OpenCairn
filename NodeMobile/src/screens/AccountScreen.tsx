    // client/src/screens/AccountScreen.jsx
    import React from "react";
    import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
    import { baseStyles } from "../styles/theme";

    export default function AccountScreen({ navigation }) {
      // TODO: Replace with real user data from context / API
      const user = {
        username: "DemoUser",
        email: "demo@example.com",
      };

      function handleLogout() {
        // TODO: hook into your auth logic
        // e.g. clear tokens, reset context, etc.
        navigation.reset({
            index: 0,
            routes: [{name: "Landing"}],
        });
      }

      return (

        <View style={styles.container}>
              {/* Account info */}
              <View style={styles.statsCard}>
                <Text style={styles.statsHeader}>My Account</Text>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Username</Text>
                  <Text style={styles.statValue}>DemoUser</Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Email</Text>
                  <Text style={styles.statValue}>demo@example.com</Text>
                </View>
              </View>
                  <View style={styles.statsCard}>
                    <Text style={styles.statsHeader}>Profile Statistics</Text>

                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Cairns created</Text>
                      <Text style={styles.statValue}>12</Text>
                    </View>

                    <View style={styles.statRow}>
                       <Text style={styles.statLabel}>Comments written</Text>
                       <Text style={styles.statValue}>14</Text>
                    </View>

                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Ratings given</Text>
                      <Text style={styles.statValue}>34</Text>
                    </View>

                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Member since</Text>
                      <Text style={styles.statValue}>August 9, 2025</Text>
                    </View>
                  </View>

          <TouchableOpacity
            style={[baseStyles.button, baseStyles.buttonPrimary]}
            onPress={handleLogout}
          >
            <Text style={baseStyles.buttonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const styles = StyleSheet.create({
      container: {
        flex: 1,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      },
      logo: {
        width: "70%",
        height: 120,
        marginBottom: 16,
      },
      infoBox: {
        width: "100%",
        backgroundColor: "#f8f9fa",
        borderRadius: 8,
        padding: 16,
        marginBottom: 24,
      },
      label: {
        fontWeight: "600",
        fontSize: 14,
        color: "#555",
        marginTop: 8,
      },
      value: {
        fontSize: 16,
        marginBottom: 8,
        color: "#222",
      },
        statsCard: {
          width: "100%",
          backgroundColor: "#fff",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3, // Android shadow
        },
        statsHeader: {
          fontWeight: "700",
          fontSize: 16,
          marginBottom: 12,
          color: "#222",
          textAlign: "center",
        },
        statRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 8,
        },
        statLabel: {
          fontSize: 14,
          color: "#555",
        },
        statValue: {
          fontSize: 14,
          fontWeight: "600",
          color: "#222",
        },

    });
