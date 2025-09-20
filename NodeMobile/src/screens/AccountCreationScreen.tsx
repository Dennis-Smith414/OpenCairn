// client/src/screens/AccountCreationScreen.jsx
import React, { useState } from "react";
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

        <Text style={styles.title}>Create Account</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
          returnKeyType="done"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={[styles.button, styles.createButton]} onPress={handleCreate}>
          <Text style={styles.buttonText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
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

  title: {
    fontSize: 22,
    fontWeight: "700",
    marginVertical: 8,
    color: "#222",
  },

  // Inputs styled to feel like your buttons
  input: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
  },

  // Button base copied from LandingScreen proportions/colors
  button: {
    width: "60%",
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: "center",
    marginVertical: 6,
  },
  createButton: {
    backgroundColor: "#008b8b", // dark cyan, matches Landing create
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  // Secondary action styled to complement primary buttons
  cancelButton: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#40e0d0", // turquoise (Landing login)
  },
  cancelText: {
    color: "#40e0d0",
    fontSize: 16,
    fontWeight: "700",
  },

  error: {
    color: "#b00020",
    textAlign: "center",
    marginTop: 8,
  },
});
