import React, { useState } from "react";
import { API_BASE } from "../config/env";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Image,
    Alert,
} from "react-native";
import { useThemeStyles } from '../styles/theme';
import { createGlobalStyles } from '../styles/globalStyles';

// Same rule enforced by the backend and the account-creation screen.
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "request" | "reset";

export default function ForgotPasswordScreen({ navigation }: { navigation: any }) {
    const { colors } = useThemeStyles();
    const globalStyles = createGlobalStyles(colors);

    const [step, setStep] = useState<Step>("request");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Step 1: ask the server to email a reset code.
    const handleRequestCode = async () => {
        setError(null);
        setInfo(null);

        if (!EMAIL_REGEX.test(email.trim())) {
            setError("Please enter a valid email address.");
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Something went wrong. Please try again.");
            }

            // Server always returns a generic success (no account enumeration).
            setStep("reset");
            setInfo("If an account exists for that email, a 6-digit code is on its way. Enter it below.");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // Step 2: submit the code + a new password.
    const handleReset = async () => {
        setError(null);
        setInfo(null);

        if (!code.trim() || !password || !confirmPassword) {
            setError("Please fill out all fields.");
            return;
        }
        if (!PASSWORD_REGEX.test(password)) {
            setError("Password must be at least 8 characters, include 1 uppercase letter and 1 special character.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), code: code.trim(), password }),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Invalid or expired code.");
            }

            Alert.alert(
                "Password updated",
                "Your password has been reset. Please log in with your new password.",
                [{ text: "OK", onPress: () => navigation.navigate("Login") }]
            );
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
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

                <Text style={globalStyles.title}>Reset Password</Text>
                <Text style={globalStyles.subtitle}>
                    {step === "request"
                        ? "Enter your email and we'll send you a code"
                        : "Enter the code we emailed you and a new password"}
                </Text>

                <View style={globalStyles.form}>
                    {step === "request" ? (
                        <>
                            <TextInput
                                testID="forgot-email-input"
                                style={globalStyles.input}
                                placeholder="Email"
                                placeholderTextColor={colors.textSecondary}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="email-address"
                                value={email}
                                onChangeText={setEmail}
                                returnKeyType="send"
                                onSubmitEditing={handleRequestCode}
                            />

                            {info && <Text style={globalStyles.helperText}>{info}</Text>}
                            {error && <Text testID="forgot-error" style={globalStyles.error}>{error}</Text>}

                            <TouchableOpacity
                                testID="forgot-send-button"
                                style={[globalStyles.button, globalStyles.buttonPrimary]}
                                onPress={handleRequestCode}
                                disabled={submitting}
                            >
                                <Text style={globalStyles.buttonText}>
                                    {submitting ? "Sending..." : "Send Code"}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                testID="forgot-cancel-button"
                                style={[globalStyles.button, globalStyles.buttonSecondary]}
                                onPress={() => navigation.goBack()}
                            >
                                <Text style={globalStyles.buttonText}>Back to Login</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <TextInput
                                testID="reset-code-input"
                                style={globalStyles.input}
                                placeholder="6-digit code"
                                placeholderTextColor={colors.textSecondary}
                                keyboardType="number-pad"
                                maxLength={6}
                                value={code}
                                onChangeText={setCode}
                                returnKeyType="next"
                            />

                            <TextInput
                                testID="reset-password-input"
                                style={globalStyles.input}
                                placeholder="New password"
                                placeholderTextColor={colors.textSecondary}
                                secureTextEntry
                                autoCapitalize="none"
                                value={password}
                                onChangeText={setPassword}
                                returnKeyType="next"
                            />

                            <TextInput
                                testID="reset-confirm-input"
                                style={globalStyles.input}
                                placeholder="Confirm new password"
                                placeholderTextColor={colors.textSecondary}
                                secureTextEntry
                                autoCapitalize="none"
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                returnKeyType="done"
                                onSubmitEditing={handleReset}
                            />

                            <Text style={globalStyles.helperText}>
                                Password must be 8+ characters with 1 uppercase and 1 special character
                            </Text>

                            {info && <Text style={globalStyles.helperText}>{info}</Text>}
                            {error && <Text testID="reset-error" style={globalStyles.error}>{error}</Text>}

                            <TouchableOpacity
                                testID="reset-submit-button"
                                style={[globalStyles.button, globalStyles.buttonPrimary]}
                                onPress={handleReset}
                                disabled={submitting}
                            >
                                <Text style={globalStyles.buttonText}>
                                    {submitting ? "Resetting..." : "Reset Password"}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                testID="reset-resend-button"
                                onPress={handleRequestCode}
                                disabled={submitting}
                            >
                                <Text style={[globalStyles.helperText, { color: colors.primary }]}>
                                    Didn't get a code? Resend
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                testID="reset-cancel-button"
                                style={[globalStyles.button, globalStyles.buttonSecondary]}
                                onPress={() => navigation.navigate("Login")}
                            >
                                <Text style={globalStyles.buttonText}>Back to Login</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
