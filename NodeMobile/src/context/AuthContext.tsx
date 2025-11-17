import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthContextType {
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  userToken: string | null;
  isLoading: boolean;
  attemptsLeft: number;
  setAttempts: (newAttempts: number) => void;
  isLocked: boolean;
  lockoutTimeLeft: number;
  resetLockout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimeLeft, setLockoutTimeLeft] = useState(0);

  const LOCKOUT_DURATION = 5 * 60 * 1000;

  const setAttempts = (newAttempts: number) => {
     setAttemptsLeft(newAttempts);
     if (newAttempts <= 0) {
       startLockout();
     }
   };


   const startLockout = () => {
     setIsLocked(true);
     setLockoutTimeLeft(LOCKOUT_DURATION);
     const lockoutEndTime = Date.now() + LOCKOUT_DURATION;
     AsyncStorage.setItem('lockoutEndTime', lockoutEndTime.toString());
   };


   const resetLockout = () => {
     setIsLocked(false);
     setLockoutTimeLeft(0);
     setAttemptsLeft(5);
     AsyncStorage.removeItem('lockoutEndTime');
   };


   const checkLockout = async () => {
     try {
       const lockoutEndTime = await AsyncStorage.getItem('lockoutEndTime');
       if (lockoutEndTime) {
         const endTime = parseInt(lockoutEndTime);
         const now = Date.now();


         if (now < endTime) {
           setIsLocked(true);
           setLockoutTimeLeft(endTime - now);
           setAttemptsLeft(0);
         } else {
           resetLockout();
         }
       }
     } catch (error) {
       console.error('Error checking lockout:', error);
     }
   };


   useEffect(() => {
     let interval: NodeJS.Timeout;


     if (isLocked && lockoutTimeLeft > 0) {
       interval = setInterval(() => {
         setLockoutTimeLeft(prev => {
           if (prev <= 1000) {
             resetLockout();
             return 0;
           }
           return prev - 1000;
         });
       }, 1000);
     }


     return () => clearInterval(interval);
   }, [isLocked, lockoutTimeLeft]);


  const login = async (token: string, rememberMe: boolean) => {
    setIsLoading(true);
    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('rememberMe', rememberMe.toString());
    setUserToken(token);
    setIsLoading(false);
  };

  const logout = async () => {
    setIsLoading(true);
    await AsyncStorage.removeItem('token');
    setUserToken(null);
    setIsLoading(false);
  };

  const isLoggedIn = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const rememberMe = await AsyncStorage.getItem('rememberMe');

      if (rememberMe === 'true' && token) {
          setUserToken(token)
      } else {
          // App closed without rememberMe causes logout
          setUserToken(null)
      }

      // Without this line, lockout is ignored after closing and
      // reopening the app
      await checkLockout();
    } catch (e) {
      console.log(`isLoggedIn error: ${e}`);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    isLoggedIn();
  }, []);

  return (
    <AuthContext.Provider value={{
      login,
      logout,
      userToken,
      isLoading,
      attemptsLeft,
      setAttempts,
      isLocked,
      lockoutTimeLeft,
      resetLockout
      }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};