// App.tsx
import nodejs from "nodejs-mobile-react-native";
import React, { useEffect, useRef, useState } from "react";
import AppNavigator from "./src/navigation/AppNavigator";
import { RouteSelectionProvider } from "./src/context/RouteSelectionContext";
import { AuthProvider } from "./src/context/AuthContext";
import { DistanceUnitProvider } from "./src/context/DistanceUnitContext";

import {
  loadSavedThemeOverride,
  startSystemThemeListener,
} from "./src/styles/theme";

import { API_BASE } from "./src/config/env";

// (same fetch patch as before…)
(function patchFetchOnce() {
  // avoid double-patch during Fast Refresh
  // @ts-ignore
  if ((global as any).__FETCH_PATCHED__) return;
  // @ts-ignore
  (global as any).__FETCH_PATCHED__ = true;

  console.log("[ENV] API_BASE =", API_BASE);
  const _fetch = global.fetch;

  global.fetch = async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input?.url || input);
    const t0 = Date.now();
    try {
      const res = await _fetch(input, init);
      const clone = res.clone();
      const text = await clone.text();
      console.log("[NET]", res.status, `${Date.now() - t0}ms`, url);
      console.log("[NET] preview:", text.slice(0, 160));
      return res;
    } catch (e) {
      console.log("[NET][ERROR]", `${Date.now() - t0}ms`, url, e);
      throw e;
    }
  };
})();

export default function App() {
  const startedRef = useRef(false);
  const [themeReady, setThemeReady] = useState(false); // 👈 new

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // ✅ load saved override BEFORE rendering navigation
      await loadSavedThemeOverride();
      startSystemThemeListener();

      if (!startedRef.current) {
        // nodejs.start("sqlite-server.js");
        startedRef.current = true;
      }

      if (!cancelled) {
        setThemeReady(true);  // 👈 now it’s safe to show UI
      }
    })();

    const handler = (msg: any) => {
      console.log("[RN] from Node:", msg);
    };

    const subscription = nodejs.channel.addListener("message", handler);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  // ⛔ Until theme is hydrated, render nothing (or a splash screen)
  if (!themeReady) {
    return null; // you could return a custom <Splash /> here instead
  }

  return (
    <AuthProvider>
      <RouteSelectionProvider>
        <DistanceUnitProvider>
          <AppNavigator />
        </DistanceUnitProvider>
      </RouteSelectionProvider>
    </AuthProvider>
  );
}
