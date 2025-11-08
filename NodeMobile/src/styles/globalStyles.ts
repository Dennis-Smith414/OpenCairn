// src/styles/globalStyles.ts
import { StyleSheet, Dimensions } from 'react-native';
import { lightColors, fonts, spacing, fontSizes, type Palette } from './theme';

const { width, height } = Dimensions.get('window');

// Create base style definitions that can be themed
const createGlobalStyles = (colors: Palette) => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    baseContainer: {
        flex: 1,
        backgroundColor: colors.background,
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
        width: "80%",
        height: 140,
        marginBottom: 24,
    },
    headerText: {
      ...fonts.header,
      fontSize: 28,
      color: colors.textPrimary,
    },
    bodyText: {
      ...fonts.body,
      fontSize: 16,
      color: colors.textPrimary,
    },
    subText: {
      ...fonts.body,
      fontSize: 14,
      color: colors.textSecondary,
    },
    button: {
      width: "70%",
      paddingVertical: 14,
      borderRadius: 30,
      alignItems: "center",
      marginVertical: 8,
    },
    buttonPrimary: {
      backgroundColor: colors.primary,
    },
    buttonSecondary: {
      backgroundColor: colors.secondary,
    },
    buttonAccent: {
      backgroundColor: colors.accent,
    },
    buttonText: {
      ...fonts.button,
      fontSize: 16,
      fontWeight: "600",
      color: colors.buttonText,
    },
    input: {
        ...fonts.body,
      width: "80%",
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 12,
      padding: 12,
      marginVertical: 8,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.backgroundAlt,
    },
    error: {
        color: colors.danger,
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
        ...fonts.header,
        fontSize: 28,
        color: colors.textPrimary,
        marginBottom: 8,
    },
    subtitle: {
        ...fonts.body,
        fontSize: 16,
        color: colors.textSecondary,
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
        color: colors.textSecondary,
        textAlign: "center",
        marginTop: 8,
        marginBottom: 16,
        paddingHorizontal: 16,
    },
    pageTitle: {
        ...fonts.header,
        fontSize: 28,
        color: colors.textPrimary,
        marginBottom: 24,
        textAlign: "center",
    },
    settingsButton: {
        marginTop: 24,
        alignSelf: "center",
    },
    header: {
        ...fonts.header,
        fontSize: 28,
        marginBottom: 24,
        color: colors.textPrimary,
        alignSelf: "center",
    },
    section: {
        width: "100%",
        backgroundColor: colors.backgroundAlt,
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
        ...fonts.body,
        fontSize: 18,
        color: colors.textPrimary,
    },
    subLabel: {
        ...fonts.body,
        color: colors.textSecondary,
        fontSize: 14,
        marginTop: 8,
    },
    logoutButton: {
        marginTop: 24,
        marginBottom: 60,
        alignSelf: "center",
    },
    highlight: {
        color: colors.secondary,
        fontWeight: "bold",
    },
    fileButton: {
        borderWidth: 2,
        borderColor: colors.accent,
        borderRadius: 8,
        borderStyle: "dashed",
        padding: 20,
        alignItems: "center",
        marginTop: 24,
        backgroundColor: colors.backgroundAlt,
    },
    fileButtonSelected: {
        backgroundColor: colors.primary,
        borderStyle: "solid",
    },
    fileButtonText: {
        ...fonts.body,
        fontSize: 16,
        fontWeight: "600",
        color: colors.textPrimary,
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
        color: colors.textPrimary,
    },
    comingSoon: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.accent,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    picker: {
        width: "80%",
        borderWidth: 1,
        borderColor: colors.accent,
        borderRadius: 12,
        marginVertical: 8,
        backgroundColor: colors.backgroundAlt,
    },
});

// Export the style creator function
export { createGlobalStyles };

// Export default light theme styles for backward compatibility
export const globalStyles = createGlobalStyles(lightColors);

// Export theme constants for convenience
export { lightColors as colors, fonts, spacing, fontSizes };