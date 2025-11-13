import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { API_BASE, OFFLINE_API_BASE } from "../config/env";

type BackendMode = "online" | "offline";
type InitialMode = BackendMode | "auto";

interface OfflineContextValue {
  mode: BackendMode;           // what we're currently using
  apiBase: string;             // resolved base URL for fetch()
  onlineApiBase: string;
  offlineApiBase: string;
  offlineAvailable: boolean;   // whether the offline server responded to /ping
  setMode: (mode: BackendMode) => void; // manual override (for a Settings toggle later)
}

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

interface OfflineProviderProps {
  children: ReactNode;
  initialMode?: InitialMode; // default "auto"
}

/**
 * OfflineProvider
 *
 * - Pings the offline server's /ping endpoint once at startup.
 * - If initialMode="auto":
 *     - if offline responds → mode = "offline"
 *     - otherwise          → mode = "online"
 * - Exposes mode + apiBase via context.
 */
export const OfflineProvider: React.FC<OfflineProviderProps> = ({
  children,
  initialMode = "auto",
}) => {
  const [mode, setMode] = useState<BackendMode>("online");
  const [offlineAvailable, setOfflineAvailable] = useState(false);
  const [checkedOffline, setCheckedOffline] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const checkOffline = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(`${OFFLINE_API_BASE}/ping`, {
          method: "GET",
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!isCancelled && res.ok) {
          setOfflineAvailable(true);
          if (initialMode === "auto") {
            setMode("offline");
          }
        } else if (!isCancelled && initialMode === "auto") {
          setMode("online");
        }
      } catch {
        if (!isCancelled && initialMode === "auto") {
          setOfflineAvailable(false);
          setMode("online");
        }
      } finally {
        if (!isCancelled) {
          setCheckedOffline(true);
        }
      }
    };

    checkOffline();

    return () => {
      isCancelled = true;
    };
  }, [initialMode]);

  // If the caller explicitly wants "online" or "offline", respect that,
  // regardless of ping result.
  useEffect(() => {
    if (initialMode === "online" || initialMode === "offline") {
      setMode(initialMode);
    }
  }, [initialMode]);

  const apiBase = mode === "offline" ? OFFLINE_API_BASE : API_BASE;

  const value = useMemo<OfflineContextValue>(
    () => ({
      mode,
      apiBase,
      onlineApiBase: API_BASE,
      offlineApiBase: OFFLINE_API_BASE,
      offlineAvailable,
      setMode, // can be wired to a toggle in Settings later
    }),
    [mode, apiBase, offlineAvailable]
  );

  // Optionally, you could gate rendering on checkedOffline,
  // but for now we just render immediately and update when ready.
  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
};

export const useOfflineBackend = (): OfflineContextValue => {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error("useOfflineBackend must be used within an OfflineProvider");
  }
  return ctx;
};
