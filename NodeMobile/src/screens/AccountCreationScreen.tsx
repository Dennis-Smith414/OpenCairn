// client/src/screens/AccountCreationScreen.jsx
import React, { useState } from "react";
import { baseStyles} from "../styles/theme";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from "react-native";

export default function AccountCreationScreen({ navigation }: { navigation: any }) {
  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError] = useState<string | null>(null);


  async function handleCreate() {
    setError(null);
    if (!username || !email || !password || !confirm) {
      setError("Please fill out all fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    // TODO: hook up to your real register API
    navigation.goBack();
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Image
          source={require("../assets/images/OCLogoLight.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={baseStyles.headerText}>Create Account</Text>

        <TextInput
          style={baseStyles.input}
          placeholder="Username"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
          returnKeyType="next"
        />
        <TextInput
          style={baseStyles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
        />
        <TextInput
          style={baseStyles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="next"
        />
        <TextInput
          style={baseStyles.input}
          placeholder="Confirm Password"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
          returnKeyType="done"
        />

        {error ? <Text style={baseStyles.error}>{error}</Text> : null}

        <TouchableOpacity style={[baseStyles.button, baseStyles.buttonPrimary]} onPress={handleCreate}>
          <Text style={baseStyles.buttonText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[baseStyles.button, baseStyles.buttonSecondary]} onPress={() => navigation.goBack()}>
          <Text style={baseStyles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Match LandingScreen: centered, white background
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  inner: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
  },

  // Same logo treatment
  logo: {
    flex: 0,
    width: "80%",
    height: 140,
    marginBottom: 8,
  },
});
