import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    Text,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
} from "react-native";
import { fetchRouteList } from "../lib/api";
import { colors } from "../styles/theme";

interface Trail {
    id: number | string;
    slug?: string;
    name: string;
    distance_m?: number | null;
    points_n?: number | null;
    updated_at?: string;
}

export default function TrailsListScreen({ navigation }: { navigation: any }) {
    const [trails, setTrails] = useState<Trail[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadTrails = useCallback(async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }
            setError(null);

            const list = await fetchRouteList();
            setTrails(Array.isArray(list) ? list : []);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load trails");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadTrails();
    }, [loadTrails]);

    const handleRefresh = () => {
        loadTrails(true);
    };

    const handleTrailPress = (trail: Trail) => {
        navigation.navigate("TrailMap", {
            id: Number(trail.id),
            name: trail.name,
        });
    };

    const formatDistance = (distanceInMeters?: number | null): string => {
        if (distanceInMeters == null) return "—";
        return `${(distanceInMeters / 1000).toFixed(2)} km`;
    };

    const formatDate = (dateString?: string): string => {
        if (!dateString) return "";
        return new Date(dateString).toLocaleDateString();
    };

    const renderTrailItem = ({ item }: { item: Trail }) => (
        <TouchableOpacity
            style={styles.trailCard}
            onPress={() => handleTrailPress(item)}
            activeOpacity={0.7}
        >
            <Text style={styles.trailName}>{item.name}</Text>

            <View style={styles.trailInfo}>
                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Distance:</Text>
                    <Text style={styles.infoValue}>{formatDistance(item.distance_m)}</Text>
                </View>

                {item.points_n != null && (
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Points:</Text>
                        <Text style={styles.infoValue}>{item.points_n}</Text>
                    </View>
                )}

                {item.updated_at && (
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Updated:</Text>
                        <Text style={styles.infoValue}>{formatDate(item.updated_at)}</Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );

    const renderHeader = () => (
        <Text style={styles.header}>Trails ({trails.length})</Text>
    );

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No trails found</Text>
            <Text style={styles.emptySubtext}>Pull down to refresh</Text>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.loadingText}>Loading trails…</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>Error: {error}</Text>
                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => loadTrails()}
                >
                    <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <FlatList
            data={trails}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderTrailItem}
            ListHeaderComponent={renderHeader}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    colors={[colors.accent]}
                />
            }
        />
    );
}

const styles = StyleSheet.create({
    centerContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: colors.background,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: colors.textSecondary,
    },
    errorText: {
        color: "#b00020",
        fontSize: 16,
        textAlign: "center",
        marginBottom: 16,
    },
    retryButton: {
        backgroundColor: colors.accent,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    retryButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    listContent: {
        padding: 16,
    },
    header: {
        fontSize: 24,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 16,
    },
    separator: {
        height: 12,
    },
    trailCard: {
        backgroundColor: colors.backgroundAlt,
        borderRadius: 12,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    trailName: {
        fontSize: 18,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 12,
    },
    trailInfo: {
        gap: 6,
    },
    infoRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    infoLabel: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    emptyContainer: {
        paddingVertical: 48,
        alignItems: "center",
    },
    emptyText: {
        fontSize: 18,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: colors.textSecondary,
    },
});