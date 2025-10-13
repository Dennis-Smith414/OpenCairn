// components/LeafletMap/WaypointDetail.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
} from "react-native";
import { colors } from "../../styles/theme";
import { useDistanceUnit } from "../../context/DistanceUnitContext";

interface WaypointDetailProps {
  visible: boolean;
  name: string;
  description: string;
  type: string;
  username: string;
  dateUploaded: string;
  distance?: number;
  votes: number;
  upvotePercentage?: number; // future implementation
  onUpvote: () => void;
  onDownvote: () => void;
  onClose: () => void;
  iconRequire?: any;
}

export const WaypointDetail: React.FC<WaypointDetailProps> = ({
  visible,
  name,
  description,
  type,
  username,
  dateUploaded,
  distance,
  votes,
  upvotePercentage,
  onUpvote,
  onDownvote,
  onClose,
  iconRequire,
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const { convertDistance } = useDistanceUnit();

  const [displayData, setDisplayData] = useState({
    name: "",
    description: "",
    type: "generic",
    username: "",
    dateUploaded: "",
    distance: undefined as number | undefined,
    votes: 0,
  });

  useEffect(() => {
    if (visible) {
      setDisplayData({
        name,
        description,
        type,
        username,
        dateUploaded,
        distance,
        votes,
      });
    }
  }, [visible, name, description, type, username, dateUploaded, distance, votes]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [400, 0],
  });

  if (!visible && slideAnim.__getValue() === 0) return null;

  const formattedDate = displayData.dateUploaded
    ? new Date(displayData.dateUploaded).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const formattedDistance =
    displayData.distance !== undefined
      ? convertDistance(displayData.distance)
      : "";

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY }], opacity: slideAnim },
      ]}
    >
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.iconWrapper}>
          <Image
            source={
              iconRequire || require("../../assets/icons/waypoints/generic.png")
            }
            style={styles.iconImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.title}>{displayData.name}</Text>
          <Text style={styles.meta}>
            {formattedDate}
            {displayData.username ? ` • ${displayData.username}` : ""}
            {formattedDistance ? ` • ${formattedDistance}` : ""}
          </Text>
        </View>

        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable content */}
      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          {displayData.description || "No description provided."}
        </Text>

        {/* Upvote Section */}
        <View style={styles.votingSection}>
          <TouchableOpacity onPress={onUpvote}>
            <Text style={styles.voteButton}>⬆️</Text>
          </TouchableOpacity>
          <Text style={styles.voteCount}>{displayData.votes}</Text>
          <TouchableOpacity onPress={onDownvote}>
            <Text style={styles.voteButton}>⬇️</Text>
          </TouchableOpacity>
        </View>

        {upvotePercentage !== undefined && (
          <Text style={styles.upvotePercent}>
            {`Upvote Score: ${Math.round(upvotePercentage)}%`}
          </Text>
        )}

        {/* Comments Section Placeholder */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsHeader}>Comments</Text>
          <Text style={styles.commentPlaceholder}>
            Comments coming soon...
          </Text>
        </View>
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "70%",
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
  iconWrapper: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  iconImage: {
    width: "100%",
    height: "100%",
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
  content: {
    flex: 1,
  },
  description: {
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  votingSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
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
  upvotePercent: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  commentsSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  commentsHeader: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 6,
  },
  commentPlaceholder: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
