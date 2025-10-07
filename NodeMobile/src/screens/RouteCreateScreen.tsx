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
import { baseStyles, colors } from "../styles/theme";
import { uploadGpxFile } from "../utils/uploadGpx";

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
            // 1️⃣ Upload GPX file (this inserts the route + gpx rows)
            const uploadResult = await uploadGpxFile(fileUri);
            // 2️⃣ PATCH to set name and region
            const res = await fetch(`http://10.0.2.2:5100/api/routes/${uploadResult.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
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
        <View style={[baseStyles.container, styles.container]}>
            <Text style={baseStyles.headerText}>Create New Route</Text>
            <View style={styles.form}>
                <Text style={styles.label}>Route Name *</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter route name"
                    placeholderTextColor={colors.textSecondary}
                    value={name}
                    onChangeText={setName}
                    editable={!uploading}
                />
                <Text style={styles.label}>Region (Optional)</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter region"
                    placeholderTextColor={colors.textSecondary}
                    value={region}
                    onChangeText={setRegion}
                    editable={!uploading}
                />
                <TouchableOpacity
                    style={[styles.fileButton, fileUri && styles.fileButtonSelected]}
                    onPress={pickFile}
                    disabled={uploading}
                >
                    <Text style={styles.fileButtonText}>
                        {fileUri ? `✓ ${fileName}` : "📎 Select GPX File"}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        baseStyles.button,
                        baseStyles.buttonPrimary,
                        styles.submitButton,
                        uploading && styles.submitButtonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={uploading}
                >
                    {uploading ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <Text style={baseStyles.buttonText}>Create Route</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
    },
    form: {
        marginTop: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 8,
        marginTop: 16,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: colors.text,
        backgroundColor: colors.backgroundAlt,
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
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },
    submitButton: {
        marginTop: 32,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
});