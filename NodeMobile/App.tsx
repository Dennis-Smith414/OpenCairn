import nodejs from 'nodejs-mobile-react-native';
import { useEffect, useRef } from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { RouteSelectionProvider } from './src/context/RouteSelectionContext';  // 👈 import the provider

export default function App() {
    const startedRef = useRef(false);

    useEffect(() => {
        if (!startedRef.current) {
            // nodejs.start('sqlite-server.js'); // must match file in nodejs-project/
            startedRef.current = true;
        }

        const handler = (msg: any) => {
            console.log('[RN] from Node:', msg);
        };
        nodejs.channel.addListener('message', handler);
        return () => nodejs.channel.removeListener('message', handler);
    }, []);

    return (
        <RouteSelectionProvider>
            <AppNavigator />
        </RouteSelectionProvider>
    );
}