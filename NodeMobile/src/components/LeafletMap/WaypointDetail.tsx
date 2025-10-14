import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import { colors } from "../../styles/theme";
import { useDistanceUnit } from "../../context/DistanceUnitContext";
import { useAuth } from "../../context/AuthContext";
import { fetchWaypointRating, submitWaypointVote } from "../../lib/ratings";
import { CommentList } from "./CommentList";

interface WaypointDetailProps {
  visible: boolean;
  id?: number;
  name: string;
  description: string;
  type: string;
  username: string;
  dateUploaded: string;
  distance?: number;
  iconRequire?: any;
  onClose: () => void;
}

export const WaypointDetail: React.FC<WaypointDetailProps> = ({
  visible,
  id,
  name,
  description,
  type,
  username,
  dateUploaded,
  distance,
  iconRequire,
  onClose,
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const { convertDistance } = useDistanceUnit();
  const { userToken } = useAuth();

  const [votes, setVotes] = useState(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [loadingVote, setLoadingVote] = useState(false);

  // --- Animate slide in/out ---
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  // --- Fetch live rating when visible ---
  useEffect(() => {
    if (visible && id && userToken) {
      fetchWaypointRating(id, userToken)
        .then((r) => {
          setVotes(r.total);
          setUserRating(r.user_rating);
        })
        .catch((err) => console.warn("Failed to fetch rating:", err));
    }
  }, [visible, id, userToken]);

  const handleVote = async (val: 1 | -1) => {
    if (!id || !userToken || loadingVote) return;
    setLoadingVote(true);
    try {
      const result = await submitWaypointVote(id, val, userToken);
      setVotes(result.total);
      setUserRating(result.user_rating);
    } catch (err) {
      console.error("Vote failed:", err);
    } finally {
      setLoadingVote(false);
    }
  };

  // --- Formatters ---
  const formattedDate = dateUploaded
    ? new Date(dateUploaded).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const formattedDistance =
    distance !== undefined ? convertDistance(distance) : "";

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [400, 0],
  });

  if (!visible && slideAnim.__getValue() === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY }], opacity: slideAnim },
      ]}
    >
      {/* Header Section */}
      <View style={styles.header}>
        <Image
          source={iconRequire || require("../../assets/icons/waypoints/generic.png")}
          style={styles.iconImage}
          resizeMode="contain"
        />
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.meta}>
            {formattedDate}
            {username ? ` • ${username}` : ""}
            {formattedDistance ? ` • ${formattedDistance}` : ""}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Description */}
      <Text style={styles.description}>
        {description || "No description provided."}
      </Text>

      {/* Voting */}
      <View style={styles.votingSection}>
        <TouchableOpacity
          onPress={() => handleVote(1)}
          disabled={loadingVote}
        >
          <Text
            style={[
              styles.voteButton,
              userRating === 1 && { color: colors.accent },
            ]}
          >
            ⬆️
          </Text>
        </TouchableOpacity>

        <Text style={styles.voteCount}>{votes}</Text>

        <TouchableOpacity
          onPress={() => handleVote(-1)}
          disabled={loadingVote}
        >
          <Text
            style={[
              styles.voteButton,
              userRating === -1 && { color: colors.error || "#d33" },
            ]}
          >
            ⬇️
          </Text>
        </TouchableOpacity>
      </View>

      {/* Comments (Always visible) */}
      {id && (
        <View style={styles.commentsSection}>
          <Text style={styles.commentsHeader}>Comments</Text>
          <CommentList waypointId={id} />
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "75%",
    backgroundColor: colors.backgroundAlt,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  iconImage: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    fontSize: 22,
    color: colors.textSecondary,
    padding: 4,
  },
  description: {
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  votingSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  voteButton: {
    fontSize: 22,
    marginHorizontal: 6,
  },
  voteCount: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  commentsSection: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  commentsHeader: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 8,
  },
});
