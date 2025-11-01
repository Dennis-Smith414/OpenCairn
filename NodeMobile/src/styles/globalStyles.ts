// src/styles/globalStyles.ts
import { StyleSheet, Dimensions } from 'react-native';
import theme from './theme'; // Import our new theme

const { width, height } = Dimensions.get('window');

export const globalStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    baseContainer: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    filesContainer: {
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
    },
    placeholderContainer: {
        alignItems: "center",
        maxWidth: 300,
    },
    logo: {
        width: "80%", // span full width
        height: 140,
        marginBottom: 24,
        },
    headerText: {
      fonts: theme.fonts.header,
      fontSize: 28,
      color: theme.colors.textPrimary,
    },
    bodyText: {
      fonts: theme.fonts.body,
      fontSize: 16,
      color: theme.colors.textPrimary,
    },
    subText: {
      fonts: theme.fonts.body,
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    button: {
      width: "70%",
      paddingVertical: 14,
      borderRadius: 30,
      alignItems: "center",
      marginVertical: 8,
    },
    buttonPrimary: {
      backgroundColor: theme.colors.primary,
    },
    buttonSecondary: {
      backgroundColor: theme.colors.secondary,
    },
    buttonAccent: {
      backgroundColor: theme.colors.accent,
    },
    buttonText: {
      fonts: theme.fonts.button,
      fontSize: 16,
      fontWeight: "600",
      color: "#fff",
    },
    input: {
        fonts: theme.fonts.body,
      width: "80%",
      borderWidth: 1,
      borderColor: theme.colors.accent,
      borderRadius: 12,
      padding: 12,
      marginVertical: 8,
      fontSize: 16,
      color: theme.colors.textPrimary,
    },
    error: {
        color: "#b00020",
        textAlign: "center",
        marginTop: 8,
      },
    scrollContent: {
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        paddingVertical: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: "700",
        color: theme.colors.text,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        marginBottom: 32,
        textAlign: "center",
    },
    form: {
        width: "100%",
        alignItems: "center",
    },
    loginButton: {
        marginTop: 8,
    },
    createButton: {
        marginTop: 8,
    },
    helperText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        textAlign: "center",
        marginTop: 8,
        marginBottom: 16,
        paddingHorizontal: 16,
    },
    pageTitle: {
        marginBottom: 24,
        textAlign: "center",
      },
    settingsButton: {
        marginTop: 24,
        alignSelf: "center",
    },
    header: {
        fonts: theme.fonts.header,
        fontSize: 28,
        marginBottom: 24,
        color: theme.colors.textPrimary,
        alignSelf: "center",
    },
    section: {
        width: "100%",
        backgroundColor: theme.colors.backgroundAlt,
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 20,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 3,
    },
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    label: {
        fonts: theme.fonts.body,
        fontSize: 18,
        color: theme.colors.textPrimary,
    },
    subLabel: {
        fonts: theme.fonts.body,
        color: theme.colors.textSecondary,
        fontSize: 14,
        marginTop: 8,
    },
    logoutButton: {
        marginTop: 24,
        marginBottom: 60,
        alignSelf: "center",
    },
    highlight: {
        color: theme.colors.secondary,
        fontWeight: "bold",
    },
    fileButton: {
        borderWidth: 2,
        borderColor: theme.colors.accent,
        borderRadius: 8,
        borderStyle: "dashed",
        padding: 20,
        alignItems: "center",
        marginTop: 24,
        backgroundColor: theme.colors.backgroundAlt,
        },
    fileButtonSelected: {
        backgroundColor: theme.colors.primary,
        borderStyle: "solid",
    },
    fileButtonText: {
        fontSize: 16,
        fontWeight: "600",
        color: theme.colors.text,
    },
    submitButton: {
        marginTop: 32,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    icon: {
        fontSize: 64,
        marginBottom: 16,
    },
    comingSoon: {
        fontSize: 14,
        fontWeight: "600",
        color: theme.colors.accent,
        textTransform: "uppercase",
        letterSpacing: 1,
    },

});

// Also export theme for convenience
export { theme };