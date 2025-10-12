import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { colors } from "../../styles/theme";

interface WaypointPopupProps {
  visible: boolean;
  name: string;
  type: string;
  votes: number;
  onUpvote: () => void;
  onDownvote: () => void;
  onExpand: () => void;
  onClose: () => void;
}

export const WaypointPopup: React.FC<WaypointPopupProps> = ({
  visible,
  name,
  type,
  votes,
  onUpvote,
  onDownvote,
  onExpand,
  onClose,
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible

  // Local display state so we can smoothly animate out
  const [displayData, setDisplayData] = useState({
    name: "",
    type: "generic",
    votes: 0,
  });

  // update local data when visible becomes true
  useEffect(() => {
    if (visible) {
      setDisplayData({ name, type, votes });
    }
  }, [visible, name, type, votes]);

  // slide animation
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      // after hiding, clear local data so ghost content disappears
      if (!visible) {
        setDisplayData({ name: "", type: "generic", votes: 0 });
      }
    });
  }, [visible]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [150, 0], // slide up from bottom
  });

  if (!visible && slideAnim.__getValue() === 0) return null;

  // temporary type icon mapping
  const icons: Record<string, string> = {
    water: "💧",
    campsite: "⛺",
    hazard: "⚠️",
    "road-access-point": "🛣️",
    intersection: "🔀",
    landmark: "📍",
    "parking-trailhead": "🅿️",
    generic: "📍",
  };
  const icon = icons[displayData.type] || "📍";

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity: slideAnim,
        },
      ]}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={onExpand}>
        <View style={styles.row}>
          <Text style={styles.icon}>{icon}</Text>
          <View style={styles.info}>
            <Text style={styles.title}>
              {displayData.name || "Waypoint"}
            </Text>
            <Text style={styles.subtitle}>{displayData.type}</Text>
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
  icon: {
    fontSize: 28,
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: "capitalize",
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
