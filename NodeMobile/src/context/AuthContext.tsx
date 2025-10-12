import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthContextType {
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  userToken: string | null;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = async (token: string) => {
    setIsLoading(true);
    await AsyncStorage.setItem('token', token);
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
      setUserToken(token);
    } catch (e) {
      console.log(`isLoggedIn error: ${e}`);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    isLoggedIn();
  }, []);

  return (
    <AuthContext.Provider value={{ login, logout, userToken, isLoading }}>
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