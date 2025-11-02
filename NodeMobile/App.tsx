// App.tsx
import nodejs from 'nodejs-mobile-react-native';
import { useEffect, useRef } from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { RouteSelectionProvider } from './src/context/RouteSelectionContext';
import { AuthProvider } from './src/context/AuthContext';
import { DistanceUnitProvider } from "./src/context/DistanceUnitContext";

// ✅ ADD: import theme bootstrap helpers
import { loadSavedThemeOverride, startSystemThemeListener } from "./src/styles/theme";

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
    <AuthProvider>
      <RouteSelectionProvider>
        <DistanceUnitProvider>
          <AppNavigator />
        </DistanceUnitProvider>
      </RouteSelectionProvider>
    </AuthProvider>
  );
}
