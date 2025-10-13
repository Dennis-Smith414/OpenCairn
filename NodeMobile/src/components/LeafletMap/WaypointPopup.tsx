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


interface WaypointPopupProps {
  visible: boolean;
  name: string;
  description: string;
  type: string;
  username: string;
  dateUploaded: string;
  distance?: number;
  votes: number;
  onUpvote: () => void;
  onDownvote: () => void;
  onExpand: () => void;
  onClose: () => void;
  iconRequire?: any;
}

export const WaypointPopup: React.FC<WaypointPopupProps> = ({
  visible,
  name,
  description,
  type,
  username,
  dateUploaded,
  distance,
  votes,
  onUpvote,
  onDownvote,
  onExpand,
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
      setDisplayData({ name, description, type, username, dateUploaded, distance, votes });
    }
  }, [visible, name, description, type, username, dateUploaded, distance, votes]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      if (!visible) {
        setDisplayData({
          name: "",
          description: "",
          username: "",
          dateUploaded: "",
          distance: undefined,
          votes: 0,
        });
      }
    });
  }, [visible]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [150, 0],
  });

  if (!visible && slideAnim.__getValue() === 0) return null;

  // Format helpers
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
      <TouchableOpacity activeOpacity={0.9} onPress={onExpand}>
        <View style={styles.row}>
          {iconRequire ? (
            <Image
              source={iconRequire || require("../../assets/icons/waypoints/generic.png")}
              style={styles.iconImage}
              resizeMode="contain"
            />

          ) : (
            <View style={[styles.iconImage, styles.placeholderIcon]} />
          )}

          <View style={styles.info}>
            <Text style={styles.title}>{displayData.name || "Waypoint"}</Text>
            <Text style={styles.desc} numberOfLines={2}>
              {displayData.description || "No description provided."}
            </Text>
            <Text style={styles.meta}>
              {formattedDate} • {displayData.username}
              {formattedDistance ? ` • ${formattedDistance}` : ""}
            </Text>
          </View>

          <View style={styles.voteContainer}>
            <TouchableOpacity onPress={onUpvote}>
              <Text style={styles.voteButton}>⬆️</Text>
            </TouchableOpacity>
            <Text style={styles.voteCount}>{displayData.votes}</Text>
            <TouchableOpacity onPress={onDownvote}>
              <Text style={styles.voteButton}>⬇️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconImage: {
    width: 36,
    height: 36,
    marginRight: 12,
    borderRadius: 8,
  },
  placeholderIcon: {
    backgroundColor: "#ddd",
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  desc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  meta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  voteContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  voteButton: {
    fontSize: 20,
    color: colors.textPrimary,
  },
  voteCount: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});
