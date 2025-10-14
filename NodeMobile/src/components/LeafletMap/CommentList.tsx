import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { colors } from "../../styles/theme";
import { fetchComments, postComment, deleteComment } from "../../lib/comments";
import { useAuth } from "../../context/AuthContext";

interface Comment {
  id: number;
  user_id: number;
  username: string;
  content: string;
  create_time: string;
}

interface CommentListProps {
  waypointId: number;
}

export const CommentList: React.FC<CommentListProps> = ({ waypointId }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { userToken, user } = useAuth();

  const loadComments = React.useCallback(async () => {
      try {
        const data = await fetchComments(waypointId);
        setComments(data);
      } catch (err) {
        console.error("Error fetching comments:", err);
      } finally {
        setLoading(false);
      }
    }, [waypointId]);

    useEffect(() => {
        setLoading(true);
        loadComments();
      }, [loadComments]);

    // 📝 Post comment
      const handleSubmit = async () => {
        if (!newComment.trim()) return;
        if (!userToken) {
          alert("You must be logged in to comment.");
          return;
        }

    setSubmitting(true);
        try {
          await postComment(waypointId, newComment.trim(), userToken);
          setNewComment("");
          await loadComments(); // ← refresh from server
        } catch (err) {
          console.error("Failed to post comment:", err);
          alert("Failed to post comment");
        } finally {
          setSubmitting(false);
        }
      };

  // 🧭 Load comments
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchComments(waypointId);
        if (active) setComments(data);
      } catch (err) {
        console.error("Error fetching comments:", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [waypointId]);


  const handleDelete = async (id: number) => {
    if (!userToken) return;
    try {
      await deleteComment(id, userToken);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  };

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentBox}>
      <View style={styles.commentHeader}>
        <Text style={styles.username}>{item.username}</Text>
        <Text style={styles.time}>{formatRelativeTime(item.create_time)}</Text>
      </View>
      <Text style={styles.content}>{item.content}</Text>
      {item.user_id === user?.id && (
        <TouchableOpacity onPress={() => handleDelete(item.id)}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      {/* 💬 Input always visible at top */}
      <View style={styles.inputRow}>
        <TextInput
          value={newComment}
          onChangeText={setNewComment}
          placeholder="Write a comment..."
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          editable={!submitting}
        />
        <TouchableOpacity
          style={[styles.submitButton, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitText}>Post</Text>
        </TouchableOpacity>
      </View>

      {/* 🧾 Comments scrollable below */}
      <FlatList
        data={comments}
        renderItem={renderComment}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
        }
        contentContainerStyle={{ paddingVertical: 8 }}
      />
    </KeyboardAvoidingView>
  );
};

// ⏰ Relative time helper
function formatRelativeTime(timestamp: string): string {
  const diff = (Date.now() - new Date(timestamp).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 10,
  },
  loading: {
    padding: 20,
    alignItems: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    color: colors.textPrimary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  submitText: {
    color: "#fff",
    fontWeight: "600",
  },
  commentBox: {
    backgroundColor: colors.card,
    padding: 10,
    borderRadius: 10,
    marginVertical: 6,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  username: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
  time: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  content: {
    color: colors.textPrimary,
    marginTop: 4,
  },
  deleteText: {
    fontSize: 12,
    color: colors.danger || "#c33",
    marginTop: 4,
  },
  emptyText: {
    textAlign: "center",
    color: colors.textSecondary,
    marginTop: 10,
  },
});
