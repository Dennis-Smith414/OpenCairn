import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "locationEnabled";

interface LocationPreferenceContextProps {
  // Whether the user wants the app using GPS at all. When false, nothing in
  // the app should request location permission or start a location watch —
  // this is a real off switch, not just a display toggle.
  locationEnabled: boolean;
  setLocationEnabled: (enabled: boolean) => void;
  // False until the persisted preference has been read from storage. Callers
  // that gate a location watch on `locationEnabled` should also wait for this,
  // so a saved "off" doesn't get a brief "on" flash (and a spurious permission
  // request) before it loads.
  isLoaded: boolean;
}

const LocationPreferenceContext = createContext<LocationPreferenceContextProps | undefined>(
  undefined
);

export const LocationPreferenceProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [locationEnabled, setLocationEnabledState] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved !== null) setLocationEnabledState(saved === "true");
      } catch (e) {
        console.warn("[LocationPreference] failed to load saved preference:", e);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const setLocationEnabled = (enabled: boolean) => {
    setLocationEnabledState(enabled);
    AsyncStorage.setItem(STORAGE_KEY, enabled.toString()).catch((e) =>
      console.warn("[LocationPreference] failed to save preference:", e)
    );
  };

  return (
    <LocationPreferenceContext.Provider
      value={{ locationEnabled, setLocationEnabled, isLoaded }}
    >
      {children}
    </LocationPreferenceContext.Provider>
  );
};

export const useLocationPreference = (): LocationPreferenceContextProps => {
  const context = useContext(LocationPreferenceContext);
  if (!context) {
    throw new Error(
      "useLocationPreference must be used within LocationPreferenceProvider"
    );
  }
  return context;
};
