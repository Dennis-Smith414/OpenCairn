import nodejs from 'nodejs-mobile-react-native';
import { useEffect, useRef } from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { RouteSelectionProvider } from './src/context/RouteSelectionContext';

console.log('App.js: Starting App component');

export default function App() {
  const startedRef = useRef(false);

  useEffect(() => {
    console.log('App.js: useEffect triggered');
    if (!startedRef.current) {
      console.log('App.js: nodejs.start() called');
   //   nodejs.start('sqlite-server.js'); // must match file in nodejs-project/
      startedRef.current = true;
    }

    const handler = (msg: any) => {
      console.log('[RN] from Node:', msg);
    };
    nodejs.channel.addListener('message', handler);
    console.log('App.js: Node.js channel listener added');
    return () => {
      nodejs.channel.removeListener('message', handler);
      console.log('App.js: Node.js channel listener removed');
    };
  }, []);

  console.log('App.js: Rendering AppNavigator');
  return (
    <RouteSelectionProvider>
      <AppNavigator />
    </RouteSelectionProvider>
  );
}
