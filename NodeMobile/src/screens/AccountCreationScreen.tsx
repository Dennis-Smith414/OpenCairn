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

    // Check for empty fields
    if (!username || !email || !password || !confirm) {
      setError("Please fill out all fields.");
      return;
    }

    // Password strength regex:
    // ^(?=.*[A-Z])  → must have at least one uppercase
    // (?=.*[^A-Za-z0-9]) → must have at least one special character
    // .{8,}$ → minimum length 8
    const strongPassword = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

    if (!strongPassword.test(password)) {
      setError("Password must be at least 8 characters, include 1 capital letter, and 1 symbol.");
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
          placeholderTextColor="lightgray"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
          returnKeyType="next"
        />
        <TextInput
          style={baseStyles.input}
          placeholder="Email"
          placeholderTextColor="lightgray"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
        />
        <TextInput
          style={baseStyles.input}
          placeholder="Password"
          placeholderTextColor="lightgray"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="next"
        />
        <TextInput
          style={baseStyles.input}
          placeholder="Confirm Password"
          placeholderTextColor="lightgray"
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


  button: {
    width: "60%",
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: "center",
    marginVertical: 6,
  },
  createButton: {
    backgroundColor: "#008b8b", 
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  cancelButton: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#40e0d0", 
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
