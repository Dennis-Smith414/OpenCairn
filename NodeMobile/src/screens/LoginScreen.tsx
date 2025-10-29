import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
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
import { globalStyles, theme } from '../styles/globalStyles';

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
            style={globalStyles.centeredContainer}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView
                contentContainerStyle={globalStyles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <Image
                    source={require("../assets/images/OCLogoLight.png")}
                    style={globalStyles.logo}
                    resizeMode="contain"
                />

                <View style={globalStyles.form}>
                    <TextInput
                        style={globalStyles.input}
                        placeholder="Username"
                        placeholderTextColor={theme.colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={username}
                        onChangeText={setUsername}
                        returnKeyType="next"
                    />

                    <TextInput
                        style={globalStyles.input}
                        placeholder="Password"
                        placeholderTextColor={theme.colors.textSecondary}
                        secureTextEntry
                        autoCapitalize="none"
                        value={password}
                        onChangeText={setPassword}
                        returnKeyType="done"
                        onSubmitEditing={handleLogin}
                    />

                    {error && <Text style={globalStyles.error}>{error}</Text>}

                    <TouchableOpacity
                        style={[globalStyles.button, globalStyles.buttonPrimary, styles.loginButton]}
                        onPress={handleLogin}
                    >
                        <Text style={globalStyles.buttonText}>Log In</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[globalStyles.button, globalStyles.buttonSecondary]}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={globalStyles.buttonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    loginButton: {
        marginTop: 8,
    },
});