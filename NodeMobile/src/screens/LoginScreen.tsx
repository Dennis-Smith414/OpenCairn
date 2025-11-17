import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../config/env";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Image,
    Switch,
} from "react-native";
import { useThemeStyles } from '../styles/theme';
import { createGlobalStyles } from '../styles/globalStyles';

export default function LoginScreen({ navigation }: { navigation: any }) {
    const { colors } = useThemeStyles();
    const globalStyles = createGlobalStyles(colors);
    
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(true);
    // Prevents the remember me toggle from flickering
    const [isLoadingRememberMe, setIsLoadingRememberMe] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { login, attemptsLeft, setAttempts, isLocked, lockoutTimeLeft } = useAuth();

    // For the weirdos who don't use Remember Me. If the app was closed
    // and Remember Me wasn't enabled, the next time the app is opened
    // the toggle will be false.
    useEffect(() => {
        const loadRememberMePreference = async () => {
            try {
                const savedPreference = await AsyncStorage.getItem('rememberMe');
                setRememberMe(savedPreference === 'true' || savedPreference === null);
            } catch (error) {
                console.error('Error loading remember me preference:', error);
            } finally {
                setIsLoadingRememberMe(false);
            }
        };
        loadRememberMePreference();
    }, []);

    const handleLogin = async () => {
       setError(null);

       if (isLocked) {
           setError("You are locked out; please wait 5 minutes and try again.");
           return;
       }


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
             const newAttemptsLeft = attemptsLeft - 1;
             setAttempts(newAttemptsLeft)
             if (newAttemptsLeft == 0) {
                 throw new Error(data.error + "\nToo many incorrect attempts. Please wait 5 minutes and try again." || 'Invalid credentials.');
             } else if (newAttemptsLeft == 1) {
                 throw new Error(data.error + "\n1 login attempt left." || 'Invalid credentials.');
             } else {
                 throw new Error(data.error + "\n" + newAttemptsLeft + " login attempts left." || 'Invalid credentials.');
             }
         }


         // On success, call the context's login function with the token.
         // The context will handle storing the token and triggering navigation.
         login(data.token, rememberMe);

       } catch (err: any) {
         setError(err.message);
       }
    };

    if (isLoadingRememberMe) {
        return (
            <View style={[globalStyles.container, { justifyContent: 'center', alignItems: 'center' }]}/>
        );
    }

    return (
        <KeyboardAvoidingView
            style={{flex: 1, backgroundColor: colors.background}}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
            <ScrollView contentContainerStyle={{flexGrow: 1}}>
                <View style={globalStyles.container}>
                    <Image
                        source={require("../assets/images/OCLogoLight.png")}
                        style={globalStyles.logo}
                        resizeMode="contain"
                    />

<View style={{ alignItems: "center", marginBottom: 20, marginTop: 10 }}>
  <Text
    style={{
      fontSize: 28,
      color: colors.textPrimary,
      fontWeight: "600",
      marginBottom: 4,
    }}
  >
    Login
  </Text>

  <Text
    style={{
      fontSize: 16,
      color: colors.textSecondary,
    }}
  >
    Welcome back!
  </Text>
</View>


                    <TextInput
                        style={globalStyles.input}
                        placeholder="Username"
                        placeholderTextColor={colors.placeholder}
                        value={username}
                        onChangeText={setUsername}
                        returnKeyType="next"
                        autoCapitalize="none"
                    />

                    <TextInput
                        style={globalStyles.input}
                        placeholder="Password"
                        placeholderTextColor={colors.placeholder}
                        secureTextEntry
                        autoCapitalize="none"
                        value={password}
                        onChangeText={setPassword}
                        returnKeyType="done"
                        onSubmitEditing={handleLogin}
                    />

                    <View style={[globalStyles.row, { justifyContent: 'space-between', marginVertical: 15, paddingHorizontal: 10 }]}>
                        <Text style={[globalStyles.text, { color: colors.text }]}>
                            Remember Me
                        </Text>
                        <Switch
                            value={rememberMe}
                            onValueChange={setRememberMe}
                            trackColor={{ false: colors.border, true: colors.primary }}
                            thumbColor={rememberMe ? colors.primary : colors.placeholder}
                        />
                    </View>

                    {error && <Text style={globalStyles.error}>{error}</Text>}

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