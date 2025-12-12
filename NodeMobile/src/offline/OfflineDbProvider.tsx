// src/offline/OfflineDbProvider.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { initOfflineDb } from "./init";

interface OfflineDbContextValue {
  ready: boolean;
}

const OfflineDbContext = createContext<OfflineDbContextValue>({ ready: false });

interface Props {
  children: ReactNode;
  withSeed?: boolean;
}

/**
 * Wrap your app (or at least the parts that use offline DB)
 * with <OfflineDbProvider> so that the schema is applied once on startup.
 */
export function OfflineDbProvider({ children, withSeed = false }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await initOfflineDb({ withSeed });
        if (!cancelled) {
          setReady(true);
        }
      } catch (err) {
        console.error("[offline-db] init error", err);
        // You might choose to surface this via UI later
        console.log("[offline-db] Props:", { children, withSeed });
        console.log("[offline-db] Children type:", typeof children);
        console.log("[offline-db] Children value:", children);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [withSeed]);

  if (!ready) {
    // You can swap this for a proper splash/loading component
    return null;
  }

  return (
    <OfflineDbContext.Provider value={{ ready }}>
      {children}
    </OfflineDbContext.Provider>
  );
}

export function useOfflineDb() {
  return useContext(OfflineDbContext);
}
