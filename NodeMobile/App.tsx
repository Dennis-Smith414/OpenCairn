// App.tsx
import nodejs from 'nodejs-mobile-react-native';
import { useEffect, useRef } from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { RouteSelectionProvider } from './src/context/RouteSelectionContext';
import { AuthProvider } from './src/context/AuthContext';
import { DistanceUnitProvider } from "./src/context/DistanceUnitContext";
import { OfflineProvider } from "./src/context/OfflineContext";


// ✅ ADD: theme bootstrap helpers
import { loadSavedThemeOverride, startSystemThemeListener } from "./src/styles/theme";

// ✅ ADD (debug): show the API base you’re actually using
import { API_BASE } from "./src/config/env";

// ✅ ADD (debug): minimal fetch logger (safe to remove later)
(function patchFetchOnce() {
  // avoid double-patch during Fast Refresh
  // @ts-ignore
  if ((global as any).__FETCH_PATCHED__) return;
  // @ts-ignore
  (global as any).__FETCH_PATCHED__ = true;

  console.log('[ENV] API_BASE =', API_BASE);
  const _fetch = global.fetch;

  global.fetch = async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input?.url || input);
    const t0 = Date.now();
    try {
      const res = await _fetch(input, init);
      const clone = res.clone();
      const text = await clone.text();
      console.log('[NET]', res.status, `${Date.now() - t0}ms`, url);
      console.log('[NET] preview:', text.slice(0, 160)); // helpful for “unexpected <”
      return res;
    } catch (e) {
      console.log('[NET][ERROR]', `${Date.now() - t0}ms`, url, e);
      throw e;
    }
  };
})();

export default function App() {
  const startedRef = useRef(false);

  useEffect(() => {
    // ✅ hydrate persisted choice and listen for OS flips (only once)
    loadSavedThemeOverride();
    startSystemThemeListener();

    if (!startedRef.current) {
      // nodejs.start('sqlite-server.js');
      startedRef.current = true;
    }

    const handler = (msg: any) => {
      console.log('[RN] from Node:', msg);
    };

    const subscription = nodejs.channel.addListener('message', handler);
    return () => {
      subscription.remove();
    };
  }, []); // runs on mount/unmount only

  return (
   <OfflineProvider initialMode="online">
    <AuthProvider>
      <RouteSelectionProvider>
        <DistanceUnitProvider>
          <AppNavigator />
        </DistanceUnitProvider>
      </RouteSelectionProvider>
    </AuthProvider>
  </OfflineProvider>
  );
}
