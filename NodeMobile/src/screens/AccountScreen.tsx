import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  UIManager,
  LayoutAnimation,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { baseStyles, colors } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../lib/api";
import { Card } from "../components/common/Card";
import { StatRow } from "../components/common/StatRow";
import { EmptyState } from "../components/common/EmptyState";
import { AccountSection } from "../components/account/AccountSection";
import { UserItemRow } from "../components/account/UserItemRow";
import { fetchUserRoutes, fetchUserWaypoints } from "../lib/api";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AccountScreen({ navigation }: any) {
  const { logout, userToken } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [expanded, setExpanded] = useState({
    routes: false,
    waypoints: false,
    comments: false,
  });

  const [userRoutes, setUserRoutes] = useState<any[]>([]);
  const [userWaypoints, setUserWaypoints] = useState<any[]>([]);

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
      } catch (error) {
        console.error("Failed to fetch profile data / routes:", error);
      }
    };
    fetchProfileAndRoutes();
  }, [userToken]);

  const toggleSection = (key: keyof typeof expanded) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[baseStyles.headerText, styles.pageTitle]}>My Account</Text>

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
        <StatRow label="Routes Created" value={profile?.stats?.routes_created ?? "—"} />
        <StatRow
          label="Waypoints Created"
          value={profile?.stats?.waypoints_created ?? "—"}
          showBorder={false}
        />
      </Card>

      {/* Routes */}
      <AccountSection
        title="My Routes"
        expanded={expanded.routes}
        onToggle={() => toggleSection("routes")}
      >
        {userRoutes.length > 0 ? (
          userRoutes.map((r) => (
            <UserItemRow
              key={r.id}
              title={r.name}
              subtitle={`${r.region || "—"} • ${new Date(r.created_at).toLocaleDateString()}`}
              onEdit={() => console.log("Edit route", r.id)}
              onDelete={() => console.log("Delete route", r.id)}
            />
          ))
        ) : (
          <EmptyState
            icon="🗺️"
            title="No routes created yet"
            subtitle="Create your first route from the map screen."
          />
        )}
      </AccountSection>

      {/* Waypoints */}
      <AccountSection
        title="My Waypoints"
        expanded={expanded.waypoints}
        onToggle={() => toggleSection("waypoints")}
      >
        {userWaypoints.length > 0 ? (
          userWaypoints.map((w) => (
            <UserItemRow
              key={w.id}
              title={w.name}
              subtitle={`${w.type} • ${new Date(w.created_at).toLocaleDateString()}`}
              onEdit={() => console.log("Edit waypoint", w.id)}
              onDelete={() => console.log("Delete waypoint", w.id)}
            />
          ))
        ) : (
          <EmptyState
            icon="📍"
            title="No waypoints created yet"
            subtitle="Tap on the map to add your first waypoint."
          />
        )}
      </AccountSection>

      {/* Comments */}
      <AccountSection
        title="My Comments"
        expanded={expanded.comments}
        onToggle={() => toggleSection("comments")}
      >
        <EmptyState
          icon="💬"
          title="No comments yet"
          subtitle="Leave a comment on a waypoint or route to see it here."
        />
      </AccountSection>

      <TouchableOpacity
        style={[baseStyles.button, baseStyles.buttonPrimary, styles.logoutButton]}
        onPress={logout}
      >
        <Text style={baseStyles.buttonText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    marginBottom: 24,
    textAlign: "center",
  },
  logoutButton: {
    marginTop: 24,
    marginBottom: 60,
    alignSelf: "center",
  },
});
