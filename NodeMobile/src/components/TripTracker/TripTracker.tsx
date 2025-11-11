// src/components/TripTracker/TripTracker.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useThemeStyles } from '../../styles/theme';
import { createGlobalStyles } from '../../styles/globalStyles';

interface TripStats {
  distanceRemaining: number; // meters
  elapsedTime: number; // seconds
  estimatedTimeRemaining: number; // seconds
  averageSpeed: number; // m/s
  isPaused: boolean;
  startTime: number | null;
  lastResumeTime: number | null;
  totalPausedTime: number; // seconds
}

interface TripTrackerProps {
  totalRouteDistance: number; // meters
  currentPosition: [number, number] | null; // [lat, lng]
  tracks: any[]; // Users track data
  onStatsUpdate?: (stats: TripStats) => void;
}

const TripTracker: React.FC<TripTrackerProps> = ({
  totalRouteDistance,
  currentPosition,
  tracks,
  onStatsUpdate
}) => {
  const { colors } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);
  
  const [tripStats, setTripStats] = useState<TripStats>({
    distanceRemaining: totalRouteDistance,
    elapsedTime: 0,
    estimatedTimeRemaining: 0,
    averageSpeed: 0,
    isPaused: true,
    startTime: null,
    lastResumeTime: null,
    totalPausedTime: 0
  });

  const tripTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = useCallback((coord1: [number, number], coord2: [number, number]): number => {
    const [lat1, lon1] = coord1;
    const [lat2, lon2] = coord2;
    
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }, []);

  // Find nearest point on track and calculate remaining distance
  const calculateRemainingDistance = useCallback((currentPos: [number, number]): number => {
    if (tracks.length === 0) return totalRouteDistance;

    let minDistance = Infinity;
    let remainingDistance = 0;
    let foundCurrentPosition = false;

    tracks.forEach(track => {
      const segments = Array.isArray(track.coords[0]) ? track.coords as [number, number][][] : [track.coords as [number, number][]];
      
      segments.forEach(segment => {
        for (let i = 0; i < segment.length; i++) {
          const point = segment[i];
          const distanceToCurrent = calculateDistance(currentPos, point);
          
          if (distanceToCurrent < minDistance) {
            minDistance = distanceToCurrent;
            foundCurrentPosition = true;
            remainingDistance = 0;
            
            // Calculate remaining distance from this point to end
            for (let j = i; j < segment.length - 1; j++) {
              remainingDistance += calculateDistance(segment[j], segment[j+1]);
            }
          } else if (foundCurrentPosition) {
            // Add distance from remaining segments
            for (let j = 0; j < segment.length - 1; j++) {
              remainingDistance += calculateDistance(segment[j], segment[j+1]);
            }
          }
        }
      });
    });

    return foundCurrentPosition && minDistance < 50 ? remainingDistance : totalRouteDistance; // 50m threshold
  }, [tracks, totalRouteDistance, calculateDistance]);

  // Update trip stats
  const updateTripStats = useCallback((currentPos: [number, number] | null) => {
    if (!currentPos || tripStats.isPaused) return;

    const remainingDistance = calculateRemainingDistance(currentPos);
    const now = Date.now();
    const elapsed = tripStats.lastResumeTime ? 
      (now - tripStats.lastResumeTime) / 1000 + tripStats.totalPausedTime : 
      tripStats.totalPausedTime;
    
    const distanceTraveled = totalRouteDistance - remainingDistance;
    const avgSpeed = elapsed > 0 ? distanceTraveled / elapsed : 0;
    const eta = avgSpeed > 0 ? remainingDistance / avgSpeed : 0;

    const newStats: TripStats = {
      ...tripStats,
      distanceRemaining: remainingDistance,
      elapsedTime: elapsed,
      estimatedTimeRemaining: eta,
      averageSpeed: avgSpeed
    };

    setTripStats(newStats);
    onStatsUpdate?.(newStats);
  }, [tripStats, calculateRemainingDistance, totalRouteDistance, onStatsUpdate]);

  // Trip control functions
  const startTrip = useCallback(() => {
    const now = Date.now();
    const newStats: TripStats = {
      ...tripStats,
      isPaused: false,
      startTime: tripStats.startTime || now,
      lastResumeTime: now
    };
    
    setTripStats(newStats);
    onStatsUpdate?.(newStats);
  }, [tripStats, onStatsUpdate]);

  const pauseTrip = useCallback(() => {
    const now = Date.now();
    const newStats: TripStats = {
      ...tripStats,
      isPaused: true,
      totalPausedTime: tripStats.lastResumeTime ? 
        tripStats.totalPausedTime + (now - tripStats.lastResumeTime) / 1000 : 
        tripStats.totalPausedTime,
      lastResumeTime: null
    };
    
    setTripStats(newStats);
    onStatsUpdate?.(newStats);
  }, [tripStats, onStatsUpdate]);

  const resetTrip = useCallback(() => {
    Alert.alert(
      "Reset Trip",
      "Are you sure you want to reset all trip statistics?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Reset", 
          style: "destructive", 
          onPress: () => {
            const newStats: TripStats = {
              distanceRemaining: totalRouteDistance,
              elapsedTime: 0,
              estimatedTimeRemaining: 0,
              averageSpeed: 0,
              isPaused: true,
              startTime: null,
              lastResumeTime: null,
              totalPausedTime: 0
            };
            setTripStats(newStats);
            onStatsUpdate?.(newStats);
          }
        },
      ]
    );
  }, [totalRouteDistance, onStatsUpdate]);

  //keep updating stats on pos change
  useEffect(() => {
    if (currentPosition && !tripStats.isPaused) {
      updateTripStats(currentPosition);
    }
  }, [currentPosition, tripStats.isPaused, updateTripStats]);

  // Formatting 
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

  const formatDistance = (meters: number): string => {
    const miles = meters * 0.000621371;
    return `${miles.toFixed(1)} mi`;
  };

  const formatSpeed = (mps: number): string => {
    const mph = mps * 2.23694;
    return `${mph.toFixed(1)} mph`;
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
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
            {tripStats.estimatedTimeRemaining > 0 ? 
              formatTime(tripStats.estimatedTimeRemaining) : '--'
            }
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
          style={[
            styles.controlButton,
            tripStats.isPaused ? styles.startButton : styles.pauseButton
          ]}
          onPress={tripStats.isPaused ? startTrip : pauseTrip}
        >
          <Text style={styles.controlButtonText}>
            {tripStats.isPaused ? 'Start Trip' : 'Pause Trip'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.controlButton, styles.resetButton]}
          onPress={resetTrip}
        >
          <Text style={styles.controlButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.statusBar}>
        <Text style={[
          styles.statusText,
          { color: tripStats.isPaused ? colors.textSecondary : colors.success }
        ]}>
          {tripStats.isPaused ? '⏸️ Paused' : '▶️ Tracking'}
        </Text>
      </View>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 12,
    padding: 16,
    margin: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statItem: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
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
    marginBottom: 8,
  },
  controlButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
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
  statusBar: {
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default TripTracker;