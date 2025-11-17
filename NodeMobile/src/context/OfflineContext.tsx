// src/context/OfflineContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { API_BASE as ONLINE_BASE, OFFLINE_API_BASE as OFFLINE_BASE } from "../config/env";
import { setApiBase } from "../lib/api";

type Mode = "online" | "offline";

interface OfflineBackendContextValue {
  apiBase: string;
  isOffline: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
}

const OfflineBackendContext = createContext<OfflineBackendContextValue>({
  apiBase: ONLINE_BASE,
  isOffline: false,
  mode: "online",
  setMode: () => {},
});

interface OfflineBackendProviderProps {
  children: ReactNode;
}

export const OfflineBackendProvider: React.FC<OfflineBackendProviderProps> = ({ children }) => {
  const [mode, setMode] = useState<Mode>("online");

  const apiBase = mode === "offline" ? OFFLINE_BASE : ONLINE_BASE;

  useEffect(() => {
    const chosen = mode === "offline" ? OFFLINE_BASE : ONLINE_BASE;
    setApiBase(chosen);
  }, [mode]);

  return (
    <OfflineBackendContext.Provider
      value={{
        apiBase,
        isOffline: mode === "offline",
        mode,
        setMode,
      }}
    >
      {children}
    </OfflineBackendContext.Provider>
  );
};

export const useOfflineBackend = (): OfflineBackendContextValue =>
  useContext(OfflineBackendContext);
