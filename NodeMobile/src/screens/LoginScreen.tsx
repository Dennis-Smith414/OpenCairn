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
import { baseStyles, colors } from "../styles/theme";

export default function LoginScreen({ navigation }: { navigation: any }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async () => {
        setError(null);

        // Validation
        if (!username.trim() || !password.trim()) {
            setError("Please fill out all fields.");
            return;
        }

        // TODO: Replace with real auth logic
        const loginSuccessful = true;

        if (loginSuccessful) {
            navigation.replace("Main");
        } else {
            setError("Invalid credentials. Please try again.");
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