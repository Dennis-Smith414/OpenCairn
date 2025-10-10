import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { baseStyles } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../lib/api";
import { jwtDecode } from "jwt-decode";

export default function AccountScreen({ navigation }) {
    const { logout, userToken } = useAuth();
    const [profile, setProfile] = useState(null); // State to hold the fetched profile data

    // This `useEffect` hook runs when the component first loads
    useEffect(() => {
        const fetchProfile = async () => {
          if (userToken) {
            try {
              const response = await fetch(`${API_BASE}/api/users/me`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${userToken}`,
                },
              });

              // 1. Check if the response itself is "ok"
              if (!response.ok) {
                // If not, throw an error to be caught by the catch block
                throw new Error('Failed to fetch profile data');
              }

              // 2. If it is "ok", then parse the JSON
              const data = await response.json();

              // 3. Set the profile state
              // Your original code assumed the user object is nested under a "user" key.
              // If your API returns the user object directly, you should use setProfile(data) instead.
              setProfile(data.user);

            } catch (error) {
              console.error("Failed to fetch profile data:", error);
            }
          }
        };
        fetchProfile();
      }, [userToken]);

      function handleLogout() {
        logout();
      }

return (
    <View style={styles.container}>
      {/* Account info */}
      <View style={styles.statsCard}>
        <Text style={styles.statsHeader}>My Account</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Username</Text>
          <Text style={styles.statValue}>{profile?.username || 'Loading...'}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Email</Text>
          <Text style={styles.statValue}>{profile?.email || 'Loading...'}</Text>
        </View>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.statsHeader}>Profile Statistics</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Member since</Text>
          {/* We format the date string to be more readable */}
          <Text style={styles.statValue}>
            {profile ? new Date(profile.created_at).toLocaleDateString() : 'Loading...'}
          </Text>
        </View>
        {/* ... other stats */}
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
