import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TextInput, TouchableOpacity, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useThemeStyles } from "../styles/theme";
import { createGlobalStyles } from "../styles/globalStyles";
import { fetchRouteComments, postRouteComment } from "../lib/api";

type RouteComment = {
  id: number;
  content: string;
  created_at: string;
  user_id?: number;
  username?: string | null;
};

export default function RouteDetailScreen({ route }: any) {
  const routeId = route.params.routeId;
  const { colors } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);

  const [comments, setComments] = useState<RouteComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const items = await fetchRouteComments(routeId);
      setComments(items);
    } catch (e: any) {
      console.error("Failed to load comments:", e);
    }
  }, [routeId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = useCallback(async () => {
    const content = newComment.trim();
    if (!content) return;

    try {
      setSubmitting(true);
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        Alert.alert("Login required", "You must be logged in to comment.");
        return;
      }

      const created = await postRouteComment(routeId, content, token);
      // prepend new comment
      setComments(prev => [created, ...prev]);
      setNewComment("");
    } catch (e: any) {
      console.error("Post comment failed:", e);
      Alert.alert("Error", "Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }, [routeId, newComment]);

  return (
    <View style={[globalStyles.container, { padding: 16 }]}>
      {/* ... your existing route details ... */}

      {/* Comment input */}
      <View style={{ marginTop: 16 }}>
        <Text style={globalStyles.subText}>Comments</Text>

        <View
          style={[
            globalStyles.input,
            { flexDirection: "row", alignItems: "center", marginTop: 8 },
          ]}
        >
          <TextInput
            value={newComment}
            onChangeText={setNewComment}
            placeholder="Add a comment…"
            placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, color: colors.textPrimary, paddingHorizontal: 8 }}
            multiline
          />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting || !newComment.trim()}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
          >
            <Text
              style={{
                color: submitting || !newComment.trim()
                  ? colors.textSecondary
                  : colors.accent,
              }}
            >
              Post
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Comment list */}
      <FlatList
        style={{ marginTop: 12 }}
        data={comments}
        keyExtractor={(c) => String(c.id)}
        renderItem={({ item }) => (
          <View
            style={{
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: colors.border ?? "#333",
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {item.username ?? "Unknown"} ·{" "}
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
            <Text
              style={{
                color: colors.textPrimary,
                marginTop: 4,
              }}
            >
              {item.content}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text
            style={[
              globalStyles.subText,
              { marginTop: 8, color: colors.textSecondary },
            ]}
          >
            No comments yet. Be the first!
          </Text>
        }
      />
    </View>
  );
}
