// AppNavigator.tsx
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";

// Screens
import AccountCreationScreen from "../screens/AccountCreationScreen";
import LoginScreen from "../screens/LoginScreen";
import AccountScreen from "../screens/AccountScreen";
import LandingScreen from "../screens/LandingScreen";
import MapScreen from "../screens/MapScreen";
import RouteSelectScreen from "../screens/RouteSelectScreen";

// Placeholder for File Manager
function FileManagerScreen() {
  return (
    <Text style={{ flex: 1, textAlign: "center", marginTop: 50 }}>
      File Manager Placeholder
    </Text>
  );
}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Bottom tabs for main app
function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Account"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "#fff" },
        tabBarLabelStyle: { fontSize: 12 },
        tabBarActiveTintColor: "#40E0D0",
      }}
    >
      <Tab.Screen
        name="Routes"
        component={RouteSelectScreen}
        options={{ tabBarIcon: () => <Text>🗺️</Text> }}
      />
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{ tabBarIcon: () => <Text>📍</Text> }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{ tabBarIcon: () => <Text>👤</Text> }}
      />
      <Tab.Screen
        name="Files"
        component={FileManagerScreen}
        options={{ tabBarIcon: () => <Text>📂</Text> }}
      />
    </Tab.Navigator>
  );
}

// Root stack for auth + main app
export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Landing">
        <Stack.Screen
          name="Landing"
          component={LandingScreen}
          options={{ title: "Welcome" }}
        />
        <Stack.Screen
          name="CreateAccount"
          component={AccountCreationScreen}
          options={{ title: "Create Account" }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: "Login" }}
        />

        {/* Main app (bottom tabs) */}
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
