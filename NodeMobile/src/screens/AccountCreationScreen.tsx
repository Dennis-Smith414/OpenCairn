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

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

export default function AccountCreationScreen({ navigation }: { navigation: any }) {
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

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

    const handleCreateAccount = async () => {
        setError(null);

        const validationError = validateInputs();
        if (validationError) {
            setError(validationError);
            return;
        }

        // TODO: API goes here
        navigation.goBack();
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

                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>Join us today</Text>

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
                        placeholder="Email"
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
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
                        returnKeyType="next"
                    />

                    <TextInput
                        style={baseStyles.input}
                        placeholder="Confirm Password"
                        placeholderTextColor={colors.textSecondary}
                        secureTextEntry
                        autoCapitalize="none"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        returnKeyType="done"
                        onSubmitEditing={handleCreateAccount}
                    />

                    <Text style={styles.helperText}>
                        Password must be 8+ characters with 1 uppercase and 1 special character
                    </Text>

                    {error && <Text style={baseStyles.error}>{error}</Text>}

                    <TouchableOpacity
                        style={[baseStyles.button, baseStyles.buttonPrimary, styles.createButton]}
                        onPress={handleCreateAccount}
                    >
                        <Text style={baseStyles.buttonText}>Create Account</Text>
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
    helperText: {
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: "center",
        marginTop: 8,
        marginBottom: 16,
        paddingHorizontal: 16,
    },
    createButton: {
        marginTop: 8,
    },
});