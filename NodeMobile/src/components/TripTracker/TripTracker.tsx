// src/components/TripTracker/TripTracker.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated } from 'react-native';
import { useThemeStyles } from '../../styles/theme';
import { createGlobalStyles } from '../../styles/globalStyles';
import { useDistanceUnit } from '../../context/DistanceUnitContext';
import { isE2E } from '../../utils/isE2E';
import { remainingDistanceMeters } from '../../utils/geoProgress';

interface TripStats {
  distanceRemaining: number;          // meters
  elapsedTime: number;               // seconds
  estimatedTimeRemaining: number;    // seconds
  averageSpeed: number;              // meters per second
  isPaused: boolean;
  startTime: number | null;
  lastResumeTime: number | null;
  totalPausedTime: number;          // seconds
}

interface TripTrackerProps {
  totalRouteDistance: number;        // meters
  currentPosition: [number, number] | null;
  tracks: any[];
  // Same progress state MapScreen.tsx already maintains via
  // advanceTrackProgress (geoProgress.ts) for the grey "hiked" line — reused
  // here instead of independently re-deriving "where is the user on this
  // route" with a second scan. See calculateRemainingDistance below.
  progressMap?: Record<string | number, { seg: number; point: [number, number] }>;
  onStatsUpdate?: (stats: TripStats) => void;
  hasActiveWaypoint?: boolean;
  hasWaypointDetail?: boolean;
  visible?: boolean;
}

const TripTracker: React.FC<TripTrackerProps> = ({
  totalRouteDistance,
  currentPosition,
  tracks,
  progressMap = {},
  onStatsUpdate,
  hasActiveWaypoint = false,
  hasWaypointDetail = false,
  visible = true,
}) => {
  const { colors } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);
  const { unit, convertDistance } = useDistanceUnit();

  // Animation for bottom position
  const bottomAnim = useRef(new Animated.Value(8)).current;

  const [tripStats, setTripStats] = useState<TripStats>({
    distanceRemaining: totalRouteDistance,
    elapsedTime: 0,
    estimatedTimeRemaining: 0,
    averageSpeed: 0,
    isPaused: true,
    startTime: null,
    lastResumeTime: null,
    totalPausedTime: 0,
  });

  const tripTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Distance remaining to the end of the loaded route(s). Reuses the SAME
  // progress state MapScreen.tsx already computes (advanceTrackProgress,
  // geoProgress.ts) for the grey "hiked" line, instead of independently
  // re-deriving "where is the user on this route" with its own full O(every
  // point of every track) nearest-point scan — that old scan ran
  // synchronously on the JS thread roughly once a second (same thread that
  // drives the animated location dot) and was a confirmed cause of the dot
  // appearing to freeze then lurch forward. A track not yet in `progressMap`
  // (not seeded — never detected near it) counts as fully remaining.
  const calculateRemainingDistance = useCallback(
    (_currentPos: [number, number]): number => {
      if (tracks.length === 0) return totalRouteDistance;
      return remainingDistanceMeters(tracks, progressMap);
    },
    [tracks, totalRouteDistance, progressMap]
  );

  // Update trip stats when position changes
  const doUpdateStats = useCallback(() => {
    if (!currentPosition) return;

    const now = Date.now();
    if (now - lastUpdateRef.current < 500) return;
    lastUpdateRef.current = now;

    setTripStats((prevStats) => {
      if (prevStats.isPaused) return prevStats;

      const remainingDistance = calculateRemainingDistance(currentPosition);
      const elapsed = prevStats.lastResumeTime
        ? (now - prevStats.lastResumeTime) / 1000 + prevStats.totalPausedTime
        : prevStats.totalPausedTime;

      const distanceTraveled = totalRouteDistance - remainingDistance;
      const avgSpeed = elapsed > 0 ? distanceTraveled / elapsed : 0;
      const eta = avgSpeed > 0 ? remainingDistance / avgSpeed : 0;

      const newStats: TripStats = {
        ...prevStats,
        distanceRemaining: remainingDistance,
        elapsedTime: elapsed,
        estimatedTimeRemaining: eta,
        averageSpeed: avgSpeed,
      };

      setTimeout(() => onStatsUpdate?.(newStats), 0);
      return newStats;
    });
  }, [currentPosition, calculateRemainingDistance, totalRouteDistance, onStatsUpdate]);

  // Start trip
  const startTrip = useCallback(() => {
    console.log('[TripTracker] Starting trip');
    const now = Date.now();
    setTripStats((prev) => {
      const newStats: TripStats = {
        ...prev,
        isPaused: false,
        startTime: prev.startTime || now,
        lastResumeTime: now,
      };
      setTimeout(() => onStatsUpdate?.(newStats), 0);
      return newStats;
    });
  }, [onStatsUpdate]);

  // Pause trip
  const pauseTrip = useCallback(() => {
    console.log('[TripTracker] Pausing trip');
    const now = Date.now();
    setTripStats((prev) => {
      const newStats: TripStats = {
        ...prev,
        isPaused: true,
        totalPausedTime: prev.lastResumeTime
          ? prev.totalPausedTime + (now - prev.lastResumeTime) / 1000
          : prev.totalPausedTime,
        lastResumeTime: null,
      };
      setTimeout(() => onStatsUpdate?.(newStats), 0);
      return newStats;
    });
  }, [onStatsUpdate]);

  // Reset trip
  const resetTrip = useCallback(() => {
    Alert.alert(
      'Reset Trip',
      'Are you sure you want to reset all trip statistics?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            const newStats: TripStats = {
              distanceRemaining: totalRouteDistance,
              elapsedTime: 0,
              estimatedTimeRemaining: 0,
              averageSpeed: 0,
              isPaused: true,
              startTime: null,
              lastResumeTime: null,
              totalPausedTime: 0,
            };
            setTripStats(newStats);
            setTimeout(() => onStatsUpdate?.(newStats), 0);
          },
        },
      ]
    );
  }, [totalRouteDistance, onStatsUpdate]);

  useEffect(() => {
    if (isE2E) return;
    if (currentPosition && !tripStats.isPaused) {
      doUpdateStats();
    }
  }, [currentPosition, tripStats.isPaused, doUpdateStats]);

  // Single animation effect controlling bottom position
  useEffect(() => {
    let targetValue = -200; // hidden off-screen by default

    if (visible) {
      if (hasWaypointDetail) {
        targetValue = 200; // push higher when detail sheet is open (if you still show it)
      } else if (hasActiveWaypoint) {
        targetValue = 140; // raised a bit when small popup is active
      } else {
        targetValue = 8; // normal resting position
      }
    } else {
      targetValue = -300; // fully hidden
    }

    Animated.timing(bottomAnim, {
      toValue: targetValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [visible, hasWaypointDetail, hasActiveWaypoint, bottomAnim]);

  // Timer for updating elapsed time regularly
  useEffect(() => {
    if (tripTimerRef.current) {
      clearInterval(tripTimerRef.current);
      tripTimerRef.current = null;
    }

    if (!tripStats.isPaused && tripStats.lastResumeTime) {
      tripTimerRef.current = setInterval(() => {
        doUpdateStats();
      }, isE2E ? 5000 : 1000);
    }

    return () => {
      if (tripTimerRef.current) {
        clearInterval(tripTimerRef.current);
        tripTimerRef.current = null;
      }
    };
  }, [tripStats.isPaused, tripStats.lastResumeTime, doUpdateStats]);

  // Formatting helpers
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // ✅ Uses DistanceUnitContext
  const formatDistance = (meters: number): string => {
    return convertDistance(meters);
  };

  // ✅ Unit-aware speed (mph vs km/h)
  const formatSpeed = (mps: number): string => {
    const label = unit === 'mi' ? 'mph' : 'km/h';
    if (!mps || mps <= 0) {
      return `0.0 ${label}`;
    }
    const factor = unit === 'mi' ? 2.23694 : 3.6; // m/s → mph or km/h
    const speed = mps * factor;
    return `${speed.toFixed(1)} ${label}`;
  };

  const styles = createStyles(colors);

  return (
    <Animated.View
      testID="trip-tracker-container"
      style={[
        styles.container,
        {
          bottom: bottomAnim,
          position: 'absolute',
          left: 8,
          right: 8,
        },
      ]}
    >
      <Text style={styles.title}>Trip Tracker</Text>

      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Remaining</Text>
          <Text style={styles.statValue}>
            {formatDistance(tripStats.distanceRemaining)}
          </Text>
        </View>

        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Elapsed</Text>
          <Text style={styles.statValue}>
            {formatTime(tripStats.elapsedTime)}
          </Text>
        </View>

        <View style={styles.statItem}>
          <Text style={styles.statLabel}>ETA</Text>
          <Text style={styles.statValue}>
            {tripStats.estimatedTimeRemaining > 0
              ? formatTime(tripStats.estimatedTimeRemaining)
              : '--'}
          </Text>
        </View>

        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Speed</Text>
          <Text style={styles.statValue}>
            {formatSpeed(tripStats.averageSpeed)}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          testID="trip-tracker-start-pause-button"
          style={[
            styles.controlButton,
            tripStats.isPaused ? styles.startButton : styles.pauseButton,
          ]}
          onPress={tripStats.isPaused ? startTrip : pauseTrip}
          activeOpacity={0.7}
        >
          <Text style={styles.controlButtonText}>
            {tripStats.isPaused ? 'Start Trip' : 'Pause Trip'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="trip-tracker-reset-button"
          style={[styles.controlButton, styles.resetButton]}
          onPress={resetTrip}
          activeOpacity={0.7}
        >
          <Text style={styles.controlButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* optional status bar if you ever re-enable it */}
      {/* <View style={styles.statusBar}>
        <Text
          style={[
            styles.statusText,
            { color: tripStats.isPaused ? colors.textSecondary : colors.success },
          ]}
        >
          {tripStats.isPaused ? '⏸️ Paused' : '▶️ Tracking'}
        </Text>
      </View> */}
    </Animated.View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.backgroundAlt,
      borderRadius: 12,
      padding: 5,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 3,
      zIndex: 1000,
    },
    title: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 3,
      textAlign: 'center',
    },
    statsGrid: {
      flexDirection: 'row-reverse',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    statItem: {
      width: '46%',
      alignItems: 'center',
      marginBottom: 10,
    },
    statLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    statValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    controls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 1,
      zIndex: 2,
    },
    controlButton: {
      flex: 1,
      paddingVertical: 5,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginHorizontal: 4,
      elevation: 2,
    },
    startButton: {
      backgroundColor: colors.success,
    },
    pauseButton: {
      backgroundColor: colors.accent,
    },
    resetButton: {
      backgroundColor: colors.danger,
    },
    controlButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    // statusBar: {
    //   alignItems: 'center',
    //   paddingTop: 8,
    //   borderTopWidth: 1,
    //   borderTopColor: colors.border,
    // },
    // statusText: {
    //   fontSize: 12,
    //   fontWeight: '500',
    // },
  });

export default TripTracker;
