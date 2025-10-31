// screens/RouteCreateScreen.tsx
import React, { useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    StyleSheet,
} from "react-native";
import { pick } from "@react-native-documents/picker";
import RNFS from "react-native-fs";
import { globalStyles, theme } from "../styles/globalStyles";
import { uploadGpxFile } from "../lib/uploadGpx";
import { useAuth } from "../context/AuthContext";
import {API_BASE as BASE} from "../lib/api";

export default function RouteCreateScreen({ navigation }: any) {
    const [name, setName] = useState("");
    const [region, setRegion] = useState("");
    const [fileUri, setFileUri] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const { userToken } = useAuth();
    const API_BASE = BASE;

    const pickFile = async () => {
        try {
            const [file] = await pick();
            if (!file) return;
            const destPath = `${RNFS.CachesDirectoryPath}/${file.name}`;
            await RNFS.copyFile(file.uri, destPath);
            setFileUri(`file://${destPath}`);
            setFileName(file.name);
        } catch (e) {
            console.error("File pick failed:", e);
            Alert.alert("Error", "Could not pick GPX file.");
        }
    };

    const handleSubmit = async () => {
        if (!name || !fileUri) {
            Alert.alert("Missing info", "Please provide a name and GPX file.");
            return;
        }
        setUploading(true);
        try {
            // Upload GPX file, and get auth (this inserts the route + gpx rows)
            const uploadResult = await uploadGpxFile(fileUri, userToken);
            // PATCH to set user, name, and region
            const res = await fetch(`http://${API_BASE}/api/routes/${uploadResult.id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${userToken}`,
              },
              body: JSON.stringify({ name, region }),
            });
            if (!res.ok) throw new Error("Failed to set metadata");
            Alert.alert("Success", "Route created!");
            navigation.goBack();
        } catch (e) {
            console.error(e);
            Alert.alert("Upload failed", "Could not create route.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <View style={[globalStyles.container]}>
            <Text style={globalStyles.headerText}>Create New Route</Text>
            <View style={globalStyles.form}>
                <Text style={globalStyles.label}>Route Name *</Text>
                <TextInput
                    style={globalStyles.input}
                    placeholder="Enter route name"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={name}
                    onChangeText={setName}
                    editable={!uploading}
                />
                <Text style={globalStyles.label}>Region (Optional)</Text>
                <TextInput
                    style={globalStyles.input}
                    placeholder="Enter region"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={region}
                    onChangeText={setRegion}
                    editable={!uploading}
                />
                <TouchableOpacity
                    style={[globalStyles.fileButton, fileUri && globalStyles.fileButtonSelected]}
                    onPress={pickFile}
                    disabled={uploading}
                >
                    <Text style={globalStyles.fileButtonText}>
                        {fileUri ? `✓ ${fileName}` : "📎 Select GPX File"}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        globalStyles.button,
                        globalStyles.buttonPrimary,
                        globalStyles.submitButton,
                        uploading && globalStyles.submitButtonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={uploading}
                >
                    {uploading ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <Text style={globalStyles.buttonText}>Create Route</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

// const styles = StyleSheet.create({
//     container: {
//         padding: 20,
//     },
//     form: {
//         marginTop: 24,
//     },
//     label: {
//         fontSize: 14,
//         fontWeight: "600",
//         color: colors.text,
//         marginBottom: 8,
//         marginTop: 16,
//     },
//     input: {
//         borderWidth: 1,
//         borderColor: colors.border,
//         borderRadius: 8,
//         padding: 12,
//         fontSize: 16,
//         color: colors.text,
//         backgroundColor: colors.backgroundAlt,
//     },
//     fileButton: {
//         borderWidth: 2,
//         borderColor: colors.accent,
//         borderRadius: 8,
//         borderStyle: "dashed",
//         padding: 20,
//         alignItems: "center",
//         marginTop: 24,
//         backgroundColor: colors.backgroundAlt,
//     },
//     fileButtonSelected: {
//         backgroundColor: colors.primary,
//         borderStyle: "solid",
//     },
//     fileButtonText: {
//         fontSize: 16,
//         fontWeight: "600",
//         color: colors.text,
//     },
//     submitButton: {
//         marginTop: 32,
//     },
//     submitButtonDisabled: {
//         opacity: 0.6,
//     },
// });