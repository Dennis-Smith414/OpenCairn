// theme.ts
import { StyleSheet } from "react-native";

export const colors = {
  primary: "#40E0D0",     // turquoise
  secondary: "#008B8B",   // dark cyan
  accent: "#5F9EA0",      // cadet blue
  background: "#FFFFFF",
  backgroundAlt: "#F8F9FA",
  textPrimary: "#222222",
  textSecondary: "#666666",
    border: undefined,
    text: undefined
};

export const fonts = {
  header: {
    fontFamily: "Comfortaa-Bold", // for titles & headings
  },
  body: {
    fontFamily: "System", // default device sans serif for readability
  },
  button: {
      fontFamily: "Comfortaa-Bold", //for buttons and menu options
  },
};

export const baseStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { flex: 0.6, // take up all available vertical space\
      width: "80%", // span full width
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
    color: "#fff",
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
  },
  error: {
      color: "#b00020",
      textAlign: "center",
      marginTop: 8,
    },
});
