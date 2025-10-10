// In your main App.tsx
import nodejs from 'nodejs-mobile-react-native';
import { useEffect, useRef } from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { RouteSelectionProvider } from './src/context/RouteSelectionContext';
import { AuthProvider } from './src/context/AuthContext';

export default function App() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      // nodejs.start('sqlite-server.js');
      startedRef.current = true;
    }

    const handler = (msg: any) => {
      console.log('[RN] from Node:', msg);
    };

    // 1. Add the listener and save the returned subscription object
    const subscription = nodejs.channel.addListener('message', handler);

    // 2. The cleanup function for useEffect now calls .remove() on that subscription
    return () => {
      subscription.remove();
    };
  }, []); // The empty dependency array means this runs only on mount and unmount

  return (
    <AuthProvider>
      <RouteSelectionProvider>
        <AppNavigator />
      </RouteSelectionProvider>
    </AuthProvider>
  );
}