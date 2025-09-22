import React, { useState } from "react";
import { baseStyles } from "../styles/theme";
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

export default function LoginScreen({ navigation }: { navigation: any }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);

    if (!username || !password) {
      setError("Please fill out all fields.");
      return;
    }

    // TODO: replace with your real auth logic
    const loginSuccessful = true;

    if (loginSuccessful) {
      // swap stack to the tab navigator
      navigation.replace("Main");
    } else {
      setError("Invalid credentials.");
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require("../assets/images/OCLogoLight.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={baseStyles.headerText}>Login</Text>

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
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="done"
        />

        {error ? <Text style={baseStyles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[baseStyles.button, baseStyles.buttonPrimary]}
          onPress={handleLogin}
        >
          <Text style={baseStyles.buttonText}>Login</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[baseStyles.button, baseStyles.buttonSecondary]}
          onPress={() => navigation.goBack()}
        >
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
});
