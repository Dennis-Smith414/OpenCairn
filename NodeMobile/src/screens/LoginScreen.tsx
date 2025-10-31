import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../config/env";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    // StyleSheet, // <-- DELETE THIS
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Image,
    Alert,
} from "react-native";

// --- STEP 1: CHANGE THE IMPORT ---
// OLD: import { baseStyles, colors } from "../styles/theme";
import { globalStyles, theme } from '../styles/globalStyles'; // <-- NEW IMPORT

export default function LoginScreen({ navigation }: { navigation: any }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const { login } = useAuth();

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
            style={{flex: 1, backgroundColor: theme.colors.background}} // Use theme for one-offs
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
            <ScrollView contentContainerStyle={{flexGrow: 1}}>
                <View style={globalStyles.container}>
                    <Image
                        source={require("../assets/images/OCLogoLight.png")}
                        style={globalStyles.logo}
                        resizeMode="contain"
                    />

                    <Text style={globalStyles.titleText}>Login</Text>
                    <Text style={globalStyles.subtitleText}>Welcome back!</Text>

                    <TextInput
                        style={globalStyles.input}
                        placeholder="Username"
                        placeholderTextColor={theme.colors.placeholder} // Use theme for specifics
                        value={username}
                        onChangeText={setUsername}
                        returnKeyType="next"

                        autoCapitalize="none"
                    />

                    <TextInput
                        style={globalStyles.input}
                        placeholder="Password"
                        placeholderTextColor={theme.colors.placeholder}
                        secureTextEntry
                        autoCapitalize="none"
                        value={password}
                        onChangeText={setPassword}
                        returnKeyType="done"
                        onSubmitEditing={handleLogin}

                    />

                    {error && <Text style={globalStyles.errorText}>{error}</Text>}

                    <TouchableOpacity
                        style={[globalStyles.button, globalStyles.buttonPrimary]}
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
