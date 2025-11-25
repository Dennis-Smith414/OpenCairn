// components/routes/RouteCard.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useThemeStyles } from "../../styles/theme";
import { createGlobalStyles } from "../../styles/globalStyles";
import RouteThumbnail from "./RouteThumbnail";

export type RouteCardItem = {
  id: number;
  slug: string;
  name: string;
  region?: string;
  upvotes?: number;
  start_lat?: number | null;
  start_lng?: number | null;
  rating_total?: number;
  user_rating?: 1 | -1 | null;
};

type Props = {
  item: RouteCardItem;
  isFavorite: boolean;
  isFavUpdating: boolean;
  isVoting: boolean;
  score: number;

  // interactions
  onToggleFavorite: () => void;
  onVoteUp: () => void;
  onVoteDown: () => void;
  onOpenComments: () => void;
  onOpenDetail: () => void;
};

export const RouteCard: React.FC<Props> = ({
  item,
  isFavorite,
  isFavUpdating,
  isVoting,
  score,
  onToggleFavorite,
  onVoteUp,
  onVoteDown,
  onOpenComments,
  onOpenDetail,
}) => {
  const { colors } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);

  const isUpvoted = item.user_rating === 1;
  const isDownvoted = item.user_rating === -1;

  return (
    <View
      style={[
        styles.cardContainer,
        {
          borderColor: colors.accent,
          backgroundColor: colors.backgroundAlt,
        },
      ]}
    >
      <View style={styles.headerRow}>
        {/* LEFT: title / region – press opens detail screen */}
        <TouchableOpacity style={styles.titleArea} onPress={onOpenDetail}>
          <Text
            style={[
              globalStyles.bodyText,
              {
                color: colors.textPrimary,
              },
            ]}
            numberOfLines={1}
          >
            {item.name}
          </Text>

          {item.region && (
            <Text
              style={[
                globalStyles.subText,
                {
                  color: colors.textSecondary,
                  marginTop: 2,
                },
              ]}
              numberOfLines={1}
            >
              {item.region}
            </Text>
          )}
        </TouchableOpacity>

        {/* MIDDLE: tiny trail outline */}
        <View style={styles.thumbnailWrapper}>
          <RouteThumbnail routeId={item.id} width={70} height={40} />
        </View>

        {/* RIGHT: favorites + votes */}
        <View style={styles.rightColumn}>
          {/* Favorite toggle */}
          <TouchableOpacity
            onPress={onToggleFavorite}
            disabled={isFavUpdating}
            style={styles.favoriteButton}
          >
            <Text
              style={{
                fontSize: 18,
                opacity: isFavUpdating ? 0.5 : 1,
                color: isFavorite ? colors.accent : colors.textSecondary,
              }}
            >
              {isFavorite ? "★" : "☆"}
            </Text>
          </TouchableOpacity>

          {/* Upvote */}
          <TouchableOpacity
            onPress={onVoteUp}
            disabled={isVoting}
            style={styles.voteButtonWrapper}
          >
            <Text
              style={{
                fontSize: 18,
                color: isUpvoted ? colors.accent : colors.textSecondary,
              }}
            >
              ▲
            </Text>
          </TouchableOpacity>

          {/* Downvote */}
          <TouchableOpacity
            onPress={onVoteDown}
            disabled={isVoting}
            style={styles.voteButtonWrapper}
          >
            <Text
              style={{
                fontSize: 18,
                color: isDownvoted
                  ? colors.error || "#d33"
                  : colors.textSecondary,
              }}
            >
              ▼
            </Text>
          </TouchableOpacity>

          {/* Score */}
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 12,
              marginTop: -2,
            }}
          >
            {score}
          </Text>
        </View>
      </View>

      {/* Footer: comments link */}
      <View style={styles.footerRow}>
        <TouchableOpacity onPress={onOpenComments}>
          <Text
            style={{
              color: colors.accent,
              fontSize: 13,
            }}
          >
            View comments
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    padding: 12,
    marginVertical: 6,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleArea: {
    flex: 1,
    padding: 12,
  },
  thumbnailWrapper: {
    width: 80,
    justifyContent: "center",
    alignItems: "center",
    paddingRight: 8,
  },
  rightColumn: {
    paddingRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  voteButtonWrapper: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  footerRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
  },
});

export default RouteCard;
