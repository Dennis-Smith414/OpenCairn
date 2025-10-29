import { StyleSheet, Dimensions } from 'react-native';
import theme from './theme'; // Import the combined theme

const { width, height } = Dimensions.get('window');

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.background,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.background,
  },
  // --- Typography ---
  titleText: {
    ...theme.fonts.header, // Apply font family
    fontSize: theme.fontSizes.large,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.medium,
    textAlign: 'center',
  },
  bodyText: {
    ...theme.fonts.body, // Apply font family
    fontSize: theme.fontSizes.medium,
    color: theme.colors.textPrimary,
    lineHeight: theme.fontSizes.medium * 1.5,
  },
  subText: {
    ...theme.fonts.body, // Apply font family
    fontSize: theme.fontSizes.small,
    color: theme.colors.textSecondary,
  },
  errorText: {
    fontSize: theme.fontSizes.small,
    color: theme.colors.danger,
    marginTop: theme.spacing.small,
    textAlign: 'center',
  },

  // --- Buttons ---
  button: { // Base button style
    width: "100%", // From baseStyles.button
    paddingVertical: theme.spacing.medium, // Adjusted to use theme spacing
    paddingHorizontal: theme.spacing.large, // Added for better padding
    borderRadius: 30, // From baseStyles.button
    alignItems: 'center',
    marginTop: theme.spacing.medium, // Use theme spacing (adjusted from marginVertical)
    backgroundColor: theme.colors.primary, // Default background
  },
  buttonPrimary: { // Variant style (can be spread/merged)
     backgroundColor: theme.colors.primary,
  },
  buttonSecondary: { // Variant style
     backgroundColor: theme.colors.secondary,
  },
  buttonAccent: { // Variant style
     backgroundColor: theme.colors.accent,
  },
  buttonText: { // Combined baseStyles.buttonText and previous globalStyles.buttonText
    ...theme.fonts.button, // Apply font family
    fontSize: theme.fontSizes.medium,
    color: theme.colors.buttonText, // Use theme color
    fontWeight: 'bold', // Kept from original globalStyles.buttonText
  },

  // --- Inputs ---
  input: {
      height: 45,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      marginBottom: theme.spacing.medium,
      paddingHorizontal: theme.spacing.large,
      backgroundColor: theme.colors.inputBackground,
      color: theme.colors.textPrimary,
      width: '100%',
  },

  // --- Images/Other ---
  logo: {
    // flex: 0.6, // Flex might be better handled per-screen layout
    width: "80%", // From baseStyles.logo
    maxWidth: 200, // Added max width for larger screens
    height: 150, // Added fixed height
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: theme.spacing.large,
  },

  // --- Specific Container ---
  baseContainer: { // Renamed from baseStyles.container
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },

  // --- Add more common styles here ---
});

// Optional: Export theme if needed directly by components
export { theme };