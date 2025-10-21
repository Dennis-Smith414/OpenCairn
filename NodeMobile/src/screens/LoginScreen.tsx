import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
//import { API_BASE } from "../lib/api";
import { API_BASE } from "../config/env";
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
    Alert,
} from "react-native";
import { baseStyles, colors } from "../styles/theme";

export default function LoginScreen({ navigation }: { navigation: any }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const { login } = useAuth(); // Get the login function from context

    const handleLogin = async () => {
        setError(null);

        if (!username.trim() || !password) {
            setError("Please fill out all fields.");
            return;
        }

        try {
          const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.trim(), password }),
          });
            const responseText = await response.text();
            const data = JSON.parse(responseText);

          if (!response.ok) {
            throw new Error(data.error || 'Invalid credentials.');
          }

          // On success, call the context's login function with the token.
          // The context will handle storing the token and triggering navigation.
          login(data.token);

        } catch (err: any) {
          setError(err.message);
        }
      };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <Image
                    source={require("../assets/images/OCLogoLight.png")}
                    style={styles.logo}
                    resizeMode="contain"
                />

                <View style={styles.form}>
                    <TextInput
                        style={baseStyles.input}
                        placeholder="Username"
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={username}
                        onChangeText={setUsername}
                        returnKeyType="next"
                    />

                    <TextInput
                        style={baseStyles.input}
                        placeholder="Password"
                        placeholderTextColor={colors.textSecondary}
                        secureTextEntry
                        autoCapitalize="none"
                        value={password}
                        onChangeText={setPassword}
                        returnKeyType="done"
                        onSubmitEditing={handleLogin}
                    />

                    {error && <Text style={baseStyles.error}>{error}</Text>}

                    <TouchableOpacity
                        style={[baseStyles.button, baseStyles.buttonPrimary, styles.loginButton]}
                        onPress={handleLogin}
                    >
                        <Text style={baseStyles.buttonText}>Log In</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[baseStyles.button, baseStyles.buttonSecondary]}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={baseStyles.buttonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        paddingVertical: 32,
    },
    logo: {
        width: "80%",
        height: 140,
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        marginBottom: 32,
    },
    form: {
        width: "100%",
        alignItems: "center",
    },
    loginButton: {
        marginTop: 8,
    },
});