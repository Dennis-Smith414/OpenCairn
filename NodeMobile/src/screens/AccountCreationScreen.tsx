import React, { useState } from "react";
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
//import { globalStyles, colors } from "../styles/theme";
import { globalStyles, theme } from '../styles/globalStyles'; // <-- NEW IMPORT

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

export default function AccountCreationScreen({ navigation }: { navigation: any }) {
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

    const handleCreateAccount = async () => {
        setError(null);

        const validationError = validateInputs();
        if (validationError) {
            setError(validationError);
            return;
        }

        try {
          const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Failed to create account.');
          }

          Alert.alert(
            'Success!',
            'Account created. Please log in.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );

        } catch (err: any) {
          setError(err.message);
        }
      };

    const validateInputs = (): string | null => {
        if (!username.trim() || !email.trim() || !password || !confirmPassword) {
            return "Please fill out all fields.";
        }

        if (!PASSWORD_REGEX.test(password)) {
            return "Password must be at least 8 characters, include 1 uppercase letter and 1 special character.";
        }

        if (password !== confirmPassword) {
            return "Passwords do not match.";
        }

        return null;
    };

    return (
        <KeyboardAvoidingView
            style={globalStyles.baseContainer}
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

                <Text style={globalStyles.title}>Create Account</Text>
                <Text style={globalStyles.subtitle}>Join us today</Text>

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
                        placeholder="Email"
                        placeholderTextColor={theme.colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
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
                        returnKeyType="next"
                    />

                    <TextInput
                        style={globalStyles.input}
                        placeholder="Confirm Password"
                        placeholderTextColor={theme.colors.textSecondary}
                        secureTextEntry
                        autoCapitalize="none"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        returnKeyType="done"
                        onSubmitEditing={handleCreateAccount}
                    />

                    <Text style={globalStyles.helperText}>
                        Password must be 8+ characters with 1 uppercase and 1 special character
                    </Text>

                    {error && <Text style={globalStyles.error}>{error}</Text>}

                    <TouchableOpacity
                        style={[globalStyles.button, globalStyles.buttonPrimary, globalStyles.createButton]}
                        onPress={handleCreateAccount}
                    >
                        <Text style={globalStyles.buttonText}>Create Account</Text>
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
