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
import { fetchComments, postComment, deleteComment } from "../../lib/comments";
import { fetchCommentRating, submitCommentVote } from "../../lib/ratings";
import { useAuth } from "../../context/AuthContext";
import { fetchCurrentUser } from "../../lib/api";

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

  // 🔁 Load comments & ratings
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

  // 👤 Fetch the current user from /me
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

  // Initial comment load
  useEffect(() => {
    setLoading(true);
    loadComments();
  }, [loadComments]);

  // 📝 Post new comment
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

  // ❌ Delete comment (with confirmation popup)
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

  // ⬆️⬇️ Vote handler
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

  // 💬 Individual comment render
  const renderComment = ({ item }: { item: Comment }) => {
    const rating = ratings[item.id] || { total: 0, user_rating: null };
    const isOwner =
      currentUser && Number(item.user_id) === Number(currentUser.id);

    //console.log("currentUser", currentUser, "comment user_id", item.user_id);

    return (
      <View
        style={[
          styles.commentBox,
          isOwner && { backgroundColor: colors.primary + "22" },
        ]}
      >
        <View style={styles.commentHeader}>
          <Text style={styles.username}>
            {isOwner ? "You" : item.username}
          </Text>
          <Text style={styles.time}>
            {formatRelativeTime(item.create_time)}
          </Text>
        </View>

        <Text style={styles.content}>{item.content}</Text>

        <View style={styles.voteRow}>
          <TouchableOpacity onPress={() => handleVote(item.id, 1)}>
            <Text
              style={[
                styles.voteButton,
                rating.user_rating === 1 && { color: colors.accent },
              ]}
            >
              ⬆️
            </Text>
          </TouchableOpacity>

          <Text style={styles.voteCount}>{rating.total}</Text>

          <TouchableOpacity onPress={() => handleVote(item.id, -1)}>
            <Text
              style={[
                styles.voteButton,
                rating.user_rating === -1 && { color: colors.error || "#d33" },
              ]}
            >
              ⬇️
            </Text>
          </TouchableOpacity>
        </View>

        {/* 🗑️ Delete button for comment owner */}
        {isOwner && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => confirmDelete(item.id)}
          >
            <Text style={styles.deleteButtonText}>🗑️ Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ⏳ Loading state
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
      {/* 💬 Input */}
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

      {/* 🧾 Comments list */}
      <View style={{ flexGrow: 1 }}>
        <FlatList
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
          }
          contentContainerStyle={{ paddingVertical: 8 }}
          showsVerticalScrollIndicator
        />
      </View>
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

// 💅 Styles
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
  deleteButton: {
    alignSelf: "flex-end",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.error || "#d33",
    borderRadius: 6,
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "center",
    color: colors.textSecondary,
    marginTop: 10,
  },
});
