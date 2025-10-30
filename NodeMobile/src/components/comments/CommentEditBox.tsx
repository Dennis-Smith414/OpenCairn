// components/comments/CommentEditBox.tsx
import React, { useState, useEffect } from "react";
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from "react-native";
import { colors } from "../../styles/theme";

type Props = {
  initialText?: string;
  saving?: boolean;
  autoFocus?: boolean;
  onCancel: () => void;
  onSave: (text: string) => Promise<void> | void;
};

export const CommentEditBox: React.FC<Props> = ({
  initialText = "",
  saving = false,
  autoFocus = true,
  onCancel,
  onSave,
}) => {
  const [text, setText] = useState(initialText);

  useEffect(() => setText(initialText), [initialText]);

  const canSave = text.trim().length > 0 && !saving;

  return (
    <View style={styles.container}>
      <TextInput
        value={text}
        onChangeText={setText}
        editable={!saving}
        autoFocus={autoFocus}
        placeholder="Edit your comment…"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        multiline
      />

      <View style={styles.buttonRow}>
        <TouchableOpacity
          onPress={onCancel}
          style={[styles.actionBtn, styles.cancelBtn]}
          disabled={saving}
        >
          <Text style={styles.actionBtnText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onSave(text.trim())}
          style={[
            styles.actionBtn,
            styles.saveBtn,
            !canSave && { opacity: 0.6 },
          ]}
          disabled={!canSave}
        >
          <Text style={styles.actionBtnText}>
            {saving ? "Saving…" : "Save"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 10,
  },
  input: {
    minHeight: 80,
    maxHeight: 180,
    backgroundColor: colors.backgroundSecondary,
    color: colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end", // right-aligned
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    width: 90, // fixed width for consistency
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: colors.secondary,
  },
  saveBtn: {
    backgroundColor: colors.primary,
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
});

