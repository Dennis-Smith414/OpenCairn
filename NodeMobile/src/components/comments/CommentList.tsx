import React, { useEffect, useState, useCallback } from "react";
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
  Alert,
} from "react-native";
import { colors } from "../../styles/theme";
import { useThemeStyles } from "../../styles/theme"; // ✅ ADDED
import { fetchComments, postComment, deleteComment, updateComment } from "../../lib/comments";
import { fetchCommentRating, submitCommentVote } from "../../lib/ratings";
import { useAuth } from "../../context/AuthContext";
import { fetchCurrentUser } from "../../lib/api";
import { CommentEditBox } from "../comments/CommentEditBox";

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
  const [ratings, setRatings] = useState<
    Record<number, { total: number; user_rating: number | null }>
  >({});
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { userToken } = useAuth();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingMap, setSavingMap] = useState<Record<number, boolean>>({});

  const { colors: theme } = useThemeStyles(); // ✅ ADDED

  // Load comments & ratings
  const loadComments = useCallback(async () => {
    try {
      const data = await fetchComments(waypointId);
      setComments(data);

      const ratingResults: Record<number, { total: number; user_rating: number | null }> = {};
      await Promise.all(
        data.map(async (c) => {
          try {
            const r = await fetchCommentRating(c.id, userToken);
            ratingResults[c.id] = r;
          } catch {
            ratingResults[c.id] = { total: 0, user_rating: null };
          }
        })
      );
      setRatings(ratingResults);
    } catch (err) {
      console.error("Error fetching comments:", err);
    } finally {
      setLoading(false);
    }
  }, [waypointId, userToken]);

  // Fetch current user
  useEffect(() => {
    const loadUser = async () => {
      if (!userToken) return;
      try {
        const userData = await fetchCurrentUser(userToken);
        setCurrentUser(userData);
      } catch (err) {
        console.error("Failed to load current user:", err);
      }
    };
    loadUser();
  }, [userToken]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    loadComments();
  }, [loadComments]);

  // Post new comment
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
      await loadComments();
    } catch (err) {
      console.error("Failed to post comment:", err);
      alert("Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete comment (confirm)
  const confirmDelete = (id: number) => {
    Alert.alert(
      "Delete Comment",
      "Are you sure you want to delete this comment?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDelete(id),
        },
      ],
      { cancelable: true }
    );
  };

  const handleDelete = async (id: number) => {
    if (!userToken) return;
    try {
      await deleteComment(id, userToken);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete comment:", err);
      alert("Failed to delete comment");
    }
  };

  // Vote handler
  const handleVote = async (commentId: number, val: 1 | -1) => {
    if (!userToken) {
      alert("You must be logged in to vote.");
      return;
    }
    try {
      const updated = await submitCommentVote(commentId, val, userToken);
      setRatings((prev) => ({ ...prev, [commentId]: updated }));
    } catch (err) {
      console.error("Failed to vote on comment:", err);
    }
  };

  // Individual comment render
  const renderComment = ({ item }: { item: Comment }) => {
    const rating = ratings[item.id] || { total: 0, user_rating: null };
    const isOwner =
      currentUser && Number(item.user_id) === Number(currentUser.id);
    const isEditing = editingId === item.id;

    return (
      <View
        style={[
          styles.commentBox,
          isOwner && { backgroundColor: (theme.primary || colors.primary) + "22" }, // ✅ ADDED
        ]}
      >
        <View style={styles.commentHeader}>
          <Text style={[styles.username, { color: theme.textPrimary }]}>
            {isOwner ? "You" : item.username}
          </Text>
          <Text style={[styles.time, { color: theme.textSecondary }]}>
            {formatRelativeTime(item.create_time)}
          </Text>
        </View>

        {isEditing ? (
          <CommentEditBox
            initialText={item.content}
            saving={!!savingMap[item.id]}
            onCancel={() => setEditingId(null)}
            onSave={async (newText) => {
              if (!userToken) {
                alert("You must be logged in to edit.");
                return;
              }
              try {
                setSavingMap((m) => ({ ...m, [item.id]: true }));
                // optimistic UI
                setComments((prev) =>
                  prev.map((c) => (c.id === item.id ? { ...c, content: newText } : c))
                );
                await updateComment(item.id, newText, userToken);
                setEditingId(null);
              } catch (e) {
                alert("Failed to save changes.");
              } finally {
                setSavingMap((m) => ({ ...m, [item.id]: false }));
              }
            }}
          />
        ) : (
          <>
            <Text style={[styles.content, { color: theme.textPrimary }]}>
              {item.content}
            </Text>

            <View style={styles.voteRow}>
              <TouchableOpacity onPress={() => handleVote(item.id, 1)}>
                <Text
                  style={[
                    styles.voteButton,
                    rating.user_rating === 1 && { color: theme.accent || colors.accent }, // ✅ ADDED
                  ]}
                >
                  ⬆️
                </Text>
              </TouchableOpacity>
              <Text style={[styles.voteCount, { color: theme.textPrimary }]}>
                {rating.total}
              </Text>
              <TouchableOpacity onPress={() => handleVote(item.id, -1)}>
                <Text
                  style={[
                    styles.voteButton,
                    rating.user_rating === -1 && { color: theme.error || "#d33" }, // ✅ ADDED
                  ]}
                >
                  ⬇️
                </Text>
              </TouchableOpacity>
            </View>

            {isOwner && (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  onPress={() => setEditingId(item.id)}
                  style={[styles.actionBtn, styles.editBtn]}
                >
                  <Text style={styles.actionBtnText}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => confirmDelete(item.id)}
                  style={[styles.actionBtn, styles.deleteBtn]}
                >
                  <Text style={styles.actionBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.textSecondary} />{/* ✅ ADDED */}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      {/* Input */}
      <View
        style={[
          styles.inputRow,
          { borderBottomColor: theme.border }, // ✅ ADDED
        ]}
      >
        <TextInput
          value={newComment}
          onChangeText={setNewComment}
          placeholder="Write a comment..."
          placeholderTextColor={theme.textSecondary} // ✅ ADDED
          style={[
            styles.input,
            {
              backgroundColor: theme.backgroundAlt, // ✅ ADDED
              color: theme.textPrimary,            // ✅ ADDED
            },
          ]}
          editable={!submitting}
        />
        <TouchableOpacity
          style={[
            styles.submitButton,
            { backgroundColor: theme.primary }, // ✅ ADDED
            submitting && { opacity: 0.6 },
          ]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitText}>Post</Text>
        </TouchableOpacity>
      </View>

      {/* Comments list */}
      <View style={{ flexGrow: 1 }}>
        <FlatList
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No comments yet. Be the first!
            </Text>
          }
          contentContainerStyle={{ paddingVertical: 8 }}
          showsVerticalScrollIndicator
        />
      </View>
    </KeyboardAvoidingView>
  );
};

// Relative time helper
function formatRelativeTime(timestamp: string): string {
  const diff = (Date.now() - new Date(timestamp).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Styles (left as-is)
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
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  voteButton: {
    fontSize: 18,
    marginHorizontal: 6,
  },
  voteCount: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  emptyText: {
    textAlign: "center",
    color: colors.textSecondary,
    marginTop: 10,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    width: 90,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  editBtn: {
    backgroundColor: colors.accent,
  },
  deleteBtn: {
    backgroundColor: colors.error || "#d33",
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
});
