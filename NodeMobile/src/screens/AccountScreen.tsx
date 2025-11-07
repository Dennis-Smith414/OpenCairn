import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  UIManager,
  LayoutAnimation,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { baseStyles, useThemeStyles, fonts } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
//import { API_BASE } from "../lib/api";
import { API_BASE } from "../config/env";
import { Card } from "../components/common/Card";
import { StatRow } from "../components/common/StatRow";
import { EmptyState } from "../components/common/EmptyState";
import { AccountSection } from "../components/account/AccountSection";
import { UserItemRow } from "../components/account/UserItemRow";
import {
    fetchUserComments,
    fetchUserRoutes,
    fetchUserWaypoints,
    } from "../lib/api";
import { deleteWaypoint } from "../lib/waypoints";
import { updateComment, deleteComment } from "../lib/comments";
import { deleteRoute } from "../lib/routes";
import { CommentEditBox } from "../components/comments/CommentEditBox";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AccountScreen({ navigation }: any) {
  const { userToken } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [expanded, setExpanded] = useState({
    routes: false,
    waypoints: false,
    comments: false,
  });
  const [userRoutes, setUserRoutes] = useState<any[]>([]);
  const [userWaypoints, setUserWaypoints] = useState<any[]>([]);
  const [userComments, setUserComments] = useState<any[]>([]);

const { colors: c } = useThemeStyles(); // active theme colors (light/dark/system)
  const [routesQuery, setRoutesQuery] = useState("");
  const [waypointsQuery, setWaypointsQuery] = useState("");
  const [commentsQuery, setCommentsQuery] = useState("");

  const [routesPreset, setRoutesPreset] = useState<DatePreset>("all");
  const [waypointsPreset, setWaypointsPreset] = useState<DatePreset>("all");
  const [commentsPreset, setCommentsPreset] = useState<DatePreset>("all");

  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [savingCommentId, setSavingCommentId] = useState<number | null>(null);

    //this fetches pretty much everything,
    //not just profile and routes
  useEffect(() => {
    const fetchProfileAndRoutes = async () => {
      if (!userToken) return;
      try {
        const profileRes = await fetch(`${API_BASE}/api/users/me`, {
          headers: { Authorization: `Bearer ${userToken}` },
        });
        if (!profileRes.ok) throw new Error("Failed to fetch profile data");

        const profileJson = await profileRes.json();
        setProfile({
          ...profileJson.user,
          stats: profileJson.stats,
        });

        const routesRes = await fetchUserRoutes(userToken);
        if (routesRes.ok) setUserRoutes(routesRes.routes);

        const waypointsRes = await fetchUserWaypoints(userToken);
        if (waypointsRes.ok) setUserWaypoints(waypointsRes.waypoints);

        const commentsRes = await fetchUserComments(userToken);
        if (commentsRes.ok) setUserComments(commentsRes.comments);


      } catch (error) {
        console.error("Failed to fetch profile data / routes:", error);
      }
    };
    fetchProfileAndRoutes();
  }, [userToken]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      // re-fetch the user data lists here if you want fresh counts/content
    });
    return unsub;
  }, [navigation]);

  const toggleSection = (key: keyof typeof expanded) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };



// ---- Filtering helpers ----
  function withinPreset(dateStr: string, preset: DatePreset) {
    if (preset === "all") return true;
    const days = preset === "7" ? 7 : preset === "30" ? 30 : 365;
    const then = new Date();
    then.setDate(then.getDate() - days);
    const d = new Date(dateStr);
    return d >= then;
  }

  function textIncludes(haystack: string, needle: string) {
    if (!needle) return true;
    return haystack.toLowerCase().includes(needle.trim().toLowerCase());
  }

  const filteredRoutes = useMemo(() => {
    return userRoutes.filter((r) => {
      const name = r.name ?? "";
      const region = r.region ?? "";
      const when = r.created_at ?? r.create_time ?? r.createdAt ?? "";
      return (
        withinPreset(when, routesPreset) &&
        textIncludes(`${name} ${region}`, routesQuery)
      );
    });
  }, [userRoutes, routesPreset, routesQuery]);

  const filteredWaypoints = useMemo(() => {
    return userWaypoints.filter((w) => {
      const text = `${w.name ?? ""} ${w.type ?? ""} ${w.description ?? ""}`;
      const when = w.created_at ?? w.create_time ?? w.createdAt ?? "";
      return withinPreset(when, waypointsPreset) && textIncludes(text, waypointsQuery);
    });
  }, [userWaypoints, waypointsPreset, waypointsQuery]);

  const filteredComments = useMemo(() => {
    return userComments.filter((c) => {
      const text = `${c.content ?? ""} ${c.waypoint_name ?? ""} ${c.route_name ?? ""}`;
      const when = c.create_time ?? c.created_at ?? c.createdAt ?? "";
      return withinPreset(when, commentsPreset) && textIncludes(text, commentsQuery);
    });
  }, [userComments, commentsPreset, commentsQuery]);

  // ---- Delete handlers ----
const handleDeleteRoute = async (id: number) => {
  if (!id || !userToken) return;
  try {
    await deleteRoute(id, userToken);
    setUserRoutes((prev) => prev.filter((r) => r.id !== id));
  } catch (err) {
    console.error("Failed to delete route:", err);
    Alert.alert("Error", "Failed to delete route.");
  }
};

const handleDeleteWaypoint = async (id: number) => {
  if (!id || !userToken) return;
  try {
    await deleteWaypoint(id, userToken);
    // remove from UI
    setUserWaypoints((prev) => prev.filter((w) => w.id !== id));
  } catch (err) {
    console.error("Failed to delete waypoint:", err);
    Alert.alert("Error", "Failed to delete waypoint.");
  }
};

const handleDeleteComment = async (id: number) => {
  if (!id || !userToken) return;
  try {
    await deleteComment(id, userToken); // returns deleted_id (ignored here)
    setUserComments((prev) => prev.filter((c) => c.id !== id));
  } catch (err) {
    console.error("Failed to delete comment:", err);
    Alert.alert("Error", "Failed to delete comment.");
  }
};



  // --- delete confirms (popup only) ---
  const confirmDeleteRoute = (id: number) => {
    Alert.alert(
      "Delete Route",
      "Are you sure you want to delete this route?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => handleDeleteRoute(id) },
      ],
      { cancelable: true }
    );
  };

  const confirmDeleteWaypoint = (id: number) => {
    Alert.alert(
      "Delete Waypoint",
      "Are you sure you want to delete this waypoint?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => handleDeleteWaypoint(id) },
      ],
      { cancelable: true }
    );
  };

  const confirmDeleteComment = (id: number) => {
    Alert.alert(
      "Delete Comment",
      "Are you sure you want to delete this comment?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => handleDeleteComment(id) },
      ],
      { cancelable: true }
    );
  };


  // ---- Edit handlers (adjust to your navigator screen names) ----
  const handleEditRoute = (id: number) => navigation.navigate("RouteEdit", { id });
  const handleEditWaypoint = (id: number) => navigation.navigate("WaypointEdit", { id });
  const handleEditComment = (id: number) => navigation.navigate("CommentEdit", { id });

return (
  <ScrollView
    style={{ flex: 1, backgroundColor: c.background }}
    contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    showsVerticalScrollIndicator={false}
  >
    <Text
      style={[
        baseStyles.headerText,
        { color: c.textPrimary },
        styles.pageTitle,
      ]}
    >
      My Account
    </Text>

    {/* Basic Info */}
    <Card>
      <StatRow label="Username" value={profile?.username || "Loading..."} />
      <StatRow label="Email" value={profile?.email || "Loading..."} showBorder={false} />
    </Card>

    {/* Stats */}
    <Card title="Profile Statistics">
      <StatRow
        label="Member Since"
        value={profile ? new Date(profile.created_at).toLocaleDateString() : "—"}
      />
      <StatRow
        label="Routes Created"
        value={profile?.stats?.routes_created ?? "—"} />
      <StatRow
        label="Waypoints Created"
        value={profile?.stats?.waypoints_created ?? "—"}
        //showBorder={false}
      />
      <StatRow
        label="Comments Written"
        value={profile?.stats?.comments_created ?? "—"}
        //showBorder={false}
      />
      <StatRow
        label="Total Upvote / Downvote Contributions"
        value={
          (Number(profile?.stats?.route_ratings) ?? 0) +
          (Number(profile?.stats?.comment_ratings) ?? 0) +
          (Number(profile?.stats?.waypoint_ratings) ?? 0)
        }
        showBorder={false}
      />
    </Card>

      {/* Routes */}
      <AccountSection
        title="My Routes"
        expanded={expanded.routes}
        onToggle={() => toggleSection("routes")}
        showSearch
        searchPlaceholder="Search name / region…"
        query={routesQuery}
        onQueryChange={setRoutesQuery}
        showDatePresets
        datePreset={routesPreset}
        onDatePresetChange={setRoutesPreset}
      >
        {filteredRoutes.length > 0 ? (
          filteredRoutes.map((r) => (
            <UserItemRow
              key={r.id}
              title={r.name}
              subtitle={`${r.region || "—"} • ${new Date(r.created_at).toLocaleDateString()}`}
              onEdit={() => handleEditRoute(r.id)}
              onDelete={() => confirmDeleteRoute(r.id)}
            />
          ))
        ) : (
          <EmptyState title="No routes" subtitle="Try a different filter or search." />
        )}
      </AccountSection>

      {/* Waypoints */}
      <AccountSection
        title="My Waypoints"
        expanded={expanded.waypoints}
        onToggle={() => toggleSection("waypoints")}
        showSearch
        searchPlaceholder="Search name / type / description..."
        query={waypointsQuery}
        onQueryChange={setWaypointsQuery}
        showDatePresets
        datePreset={waypointsPreset}
        onDatePresetChange={setWaypointsPreset}
      >
        {filteredWaypoints.length > 0 ? (
          filteredWaypoints.map((w) => (
            <UserItemRow
              key={w.id}
              title={w.name}
              subtitle={`${w.route_name} • ${w.type} • ${new Date(w.created_at).toLocaleDateString()}`}
              onEdit={() => handleEditWaypoint(w.id)}
              onDelete={() => confirmDeleteWaypoint(w.id)}
            />
          ))
        ) : (
          <EmptyState title="No waypoints" subtitle="Adjust your filters or search." />
        )}
      </AccountSection>

      {/* Comments */}
      <AccountSection
        title="My Comments"
        expanded={expanded.comments}
        onToggle={() => toggleSection("comments")}
        showSearch
        searchPlaceholder="Search comment text / waypoint /route…"
        query={commentsQuery}
        onQueryChange={setCommentsQuery}
        showDatePresets
        datePreset={commentsPreset}
        onDatePresetChange={setCommentsPreset}
      >
        {filteredComments.length > 0 ? (
          filteredComments.map((c) => {
            const isEditing = editingCommentId === c.id;
            return (
              <View key={c.id} style={{ marginBottom: 10 }}>
                {isEditing ? (
                  <CommentEditBox
                    initialText={c.content}
                    saving={savingCommentId === c.id}
                    onCancel={() => setEditingCommentId(null)}
                    onSave={async (text) => {
                      if (!userToken) return;
                      try {
                        setSavingCommentId(c.id);
                        // optimistic update
                        setUserComments((prev) => prev.map(cc => cc.id === c.id ? { ...cc, content: text } : cc));
                        await updateComment(c.id, text, userToken);
                        setEditingCommentId(null);
                      } catch (e) {
                        Alert.alert("Error", "Failed to update comment.");
                      } finally {
                        setSavingCommentId(null);
                      }
                    }}
                  />
                ) : (
                  <UserItemRow
                    title={c.waypoint_name || c.route_name || "Unknown"}
                    subtitle={`${new Date(c.create_time).toLocaleDateString()} • ${c.content}`}
                    onEdit={() => setEditingCommentId(c.id)}
                    onDelete={() => confirmDeleteComment(c.id)}
                  />
                )}
              </View>
            );
          })
        ) : (
          <EmptyState title="No comments" subtitle="Nothing matches your search." />
        )}

      </AccountSection>

      <TouchableOpacity
        style={[baseStyles.button, baseStyles.buttonSecondary, styles.settingsButton]}
        onPress={() => navigation.navigate("Settings")}
      >
        <Text style={baseStyles.buttonText}>Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    marginBottom: 24,
    textAlign: "center",
  },

    settingsButton: {
      marginTop: 24,
      alignSelf: "center",
    },

});
