// screens/RouteCreateScreen.tsx
import React, { useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
} from "react-native";
import { pick } from "@react-native-documents/picker";
import RNFS from "react-native-fs";
import { baseStyles, colors } from "./src/styles/theme.ts";
import { uploadGpxFile } from "./src/utils/uploadGpx.ts";

const API_BASE_URL = "http://10.0.2.2:5100"; // TODO: Move to config

export default function RouteCreateScreen({ navigation }: any) {
    const [name, setName] = useState("");
    const [region, setRegion] = useState("");
    const [fileUri, setFileUri] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

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
            Alert.alert("Error", "Could not select GPX file.");
        }
    };

    const handleSubmit = async () => {
        // Validation
        if (!name.trim()) {
            Alert.alert("Missing Name", "Please provide a route name.");
            return;
        }
        if (!fileUri) {
            Alert.alert("Missing File", "Please select a GPX file.");
            return;
        }

        setUploading(true);
        try {
            // Upload GPX file
            const uploadResult = await uploadGpxFile(fileUri);

            // Update route metadata
            const response = await fetch(`${API_BASE_URL}/api/routes/${uploadResult.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    region: region.trim() || undefined
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to update route metadata");
            }

            Alert.alert("Success", "Route created successfully!");
            navigation.goBack();
        } catch (e: any) {
            console.error("Route creation failed:", e);
            Alert.alert(
                "Upload Failed",
                e.message || "Could not create route. Please try again."
            );
        } finally {
            setUploading(false);
        }
    };

    return (
        <View style={[baseStyles.container, { padding: 20 }]}>
            <Text style={baseStyles.headerText}>Create New Route</Text>
            <Text style={{ marginTop: 16 }}>Name</Text>
            <TextInput
                style={{
                    borderWidth: 1,
                    borderColor: colors.accent,
                    borderRadius: 8,
                    padding: 8,
                    width: "100%",
                    marginTop: 4,
                }}
                value={name}
                onChangeText={setName}
            />
            <Text style={{ marginTop: 16 }}>Region</Text>
            <TextInput
                style={{
                    borderWidth: 1,
                    borderColor: colors.accent,
                    borderRadius: 8,
                    padding: 8,
                    width: "100%",
                    marginTop: 4,
                }}
                value={region}
                onChangeText={setRegion}
            />
            <TouchableOpacity
                style={[baseStyles.button, { backgroundColor: colors.accent, marginTop: 16 }]}
                onPress={pickFile}
            >
                <Text style={baseStyles.buttonText}>
                    {fileUri ? "✅ File Selected" : "📎 Pick GPX File"}
                </Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[baseStyles.button, baseStyles.buttonPrimary, { marginTop: 24 }]}
                onPress={handleSubmit}
                disabled={uploading}
            >
                {uploading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={baseStyles.buttonText}>🚀 Create Route</Text>
                )}
            </TouchableOpacity>
        </View>
    );
}