import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import { colors } from "../../styles/theme";
import { useThemeStyles } from "../../styles/theme"; // ADDED
import { useDistanceUnit } from "../../context/DistanceUnitContext";
import { useAuth } from "../../context/AuthContext";
import { fetchWaypointRating, submitWaypointVote } from "../../lib/ratings";
import { CommentList } from "../comments/CommentList";
import { fetchCurrentUser } from "../../lib/api";
import { deleteWaypoint } from "../../lib/waypoints";
import { useNavigation } from "@react-navigation/native";
import { baseStyles } from "../../styles/theme";

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
  onDeleted?: () => void;
  ownerId?: number;
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
  onDeleted,
  ownerId,
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const { convertDistance } = useDistanceUnit();
  const { userToken } = useAuth();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [votes, setVotes] = useState(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [loadingVote, setLoadingVote] = useState(false);
  const navigation = useNavigation<any>();

  const { colors: themeColors } = useThemeStyles(); // ADDED

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!userToken) return;
      try {
        const me = await fetchCurrentUser(userToken);
        if (mounted) setCurrentUser(me);
      } catch (e) {
        console.log("Failed to fetch /me", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userToken]);

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

  const isOwner =
    !!currentUser &&
    typeof ownerId === "number" &&
    Number(currentUser.id) === Number(ownerId);

  const confirmDeleteWaypoint = () => {
    if (!id) return;
    Alert.alert(
      "Delete Waypoint",
      "Are you sure you want to delete this waypoint?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: handleDeleteWaypoint },
      ],
      { cancelable: true }
    );
  };

  const handleDeleteWaypoint = async () => {
    if (!id || !userToken) return;
    try {
      await deleteWaypoint(id, userToken);
      onClose?.();
      onDeleted?.();
    } catch (err) {
      console.error("Failed to delete waypoint:", err);
      Alert.alert("Error", "Failed to delete waypoint.");
    }
  };

  if (!visible && (slideAnim as any).__getValue?.() === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        // ✅ ADDED: theme-driven overrides
        {
          backgroundColor: themeColors.backgroundAlt,
          shadowColor: "#000",
        },
        { transform: [{ translateY }], opacity: slideAnim },
      ]}
    >
      {/* Header Section */}
      <View style={styles.header}>
        <Image
          source={
            iconRequire || require("../../assets/icons/waypoints/generic.png")
          }
          style={styles.iconImage}
          resizeMode="contain"
        />
        <View style={styles.headerInfo}>
          <Text style={[styles.title, { color: themeColors.textPrimary }]}>
            {name}
          </Text>
          <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
            {formattedDate}
            {username ? ` • ${username}` : ""}
            {formattedDistance ? ` • ${formattedDistance}` : ""}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose}>
          <Text style={[styles.closeButton, { color: themeColors.textSecondary }]}>
            ✕
          </Text>
        </TouchableOpacity>
      </View>

      {/* Description */}
      <Text style={[styles.description, { color: themeColors.textPrimary }]}>
        {description || "No description provided."}
      </Text>

      {/* Voting */}
      <View style={styles.votingSection}>
        <TouchableOpacity onPress={() => handleVote(1)} disabled={loadingVote}>
          <Text
            style={[
              styles.voteButton,
              { color: themeColors.textPrimary }, //  ADDED
              userRating === 1 && { color: themeColors.accent }, //  ADDED
            ]}
          >
            ⬆️
          </Text>
        </TouchableOpacity>

        <Text style={[styles.voteCount, { color: themeColors.textPrimary }]}>
          {votes}
        </Text>

        <TouchableOpacity onPress={() => handleVote(-1)} disabled={loadingVote}>
          <Text
            style={[
              styles.voteButton,
              { color: themeColors.textPrimary }, //  ADDED
              userRating === -1 && { color: themeColors.error || "#d33" } //  ADDED
            ]}
          >
            ⬇️
          </Text>
        </TouchableOpacity>
      </View>

      {/* Comments (Always visible) */}
      {id && (
        <View
          style={[
            styles.commentsSection,
            // ✅ ADDED: theme-driven overrides
            {
              borderTopColor: themeColors.border,
              backgroundColor: themeColors.backgroundSecondary,
            },
          ]}
        >
          <Text
            style={[styles.commentsHeader, { color: themeColors.textPrimary }]}
          >
            Comments
          </Text>
          <CommentList waypointId={id} />
        </View>
      )}

      {isOwner && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            marginTop: 20,
            gap: 30,
            paddingHorizontal: 80,
          }}
        >
          {/* Edit Button */}
          <TouchableOpacity
            onPress={() => navigation.navigate("WaypointEdit", { id })}
            style={[
              baseStyles.button,
              {
                backgroundColor: themeColors.primary, // ✅ ADDED
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 8,
              },
            ]}
          >
            <Text
              style={{
                color: "#fff",
                fontWeight: "600",
              }}
            >
              Edit Waypoint
            </Text>
          </TouchableOpacity>

          {/* Delete Button */}
          <TouchableOpacity
            onPress={confirmDeleteWaypoint}
            style={[
              baseStyles.button,
              {
                backgroundColor: themeColors.error || "#d33", // ✅ ADDED
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 8,
              },
            ]}
          >
            <Text
              style={{
                color: "#fff",
                fontWeight: "600",
              }}
            >
              Delete Waypoint
            </Text>
          </TouchableOpacity>
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
    paddingBottom: 40,
    backgroundColor: colors.backgroundSecondary, 
    borderRadius: 10,
  },
  commentsHeader: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary, 
    marginBottom: 8,
  },
});
