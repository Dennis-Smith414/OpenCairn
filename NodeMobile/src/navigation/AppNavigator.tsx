// src/navigation/AppNavigator.tsx
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Image, View, ActivityIndicator } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useThemeStyles } from "../styles/theme"; // ← ADD

// Screens
import AccountCreationScreen from "../screens/AccountCreationScreen";
import LoginScreen from "../screens/LoginScreen";
import AccountScreen from "../screens/AccountScreen";
import LandingScreen from "../screens/LandingScreen";
import MapScreen from "../screens/MapScreen";
import RouteSelectScreen from "../screens/RouteSelectScreen";
import FileManagerScreen from "../screens/FileManagerScreen";
import RouteCreateScreen from "../screens/RouteCreateScreen";
import WaypointCreateScreen from "../screens/WaypointCreateScreen";
import SettingsScreen from "../screens/SettingsScreen";
import WaypointEditScreen from "../screens/WaypointEditScreen";
import RouteCommentsScreen from "../screens/RouteCommentScreen";

// Navigators
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const AccountStackNav = createNativeStackNavigator();
const MapStackNav = createNativeStackNavigator();
const RoutesStackNav = createNativeStackNavigator();

/* ----------------------------
   Account Stack
---------------------------- */
function AccountStack() {
  return (
    <AccountStackNav.Navigator screenOptions={{ headerShown: false }}>
      <AccountStackNav.Screen name="AccountMain" component={AccountScreen} />
      <AccountStackNav.Screen name="Settings" component={SettingsScreen} />
    </AccountStackNav.Navigator>
  );
}

/* ----------------------------
   Map Stack
---------------------------- */
function MapStack() {
  return (
    <MapStackNav.Navigator screenOptions={{ headerShown: false }}>
      <MapStackNav.Screen name="MapMain" component={MapScreen} />
      <MapStackNav.Screen
        name="WaypointCreate"
        component={WaypointCreateScreen}
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
    </MapStackNav.Navigator>
  );
}

/* ----------------------------
   Routes Stack
---------------------------- */
/* ----------------------------
   Routes Stack
---------------------------- */
function RoutesStack() {
  return (
    <RoutesStackNav.Navigator screenOptions={{ headerShown: false }}>
      <RoutesStackNav.Screen name="RoutesMain" component={RouteSelectScreen} />
      <RoutesStackNav.Screen
        name="RouteCreate"
        component={RouteCreateScreen}
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />

<RoutesStackNav.Screen
  name="RouteComments"
  component={RouteCommentsScreen}
  options={({ route }: any) => ({
    headerShown: true,
    title: route?.params?.routeName ?? "Route Comments",
  })}
/>

    </RoutesStackNav.Navigator>
  );
}


/* ----------------------------
   Main Tab Navigator
---------------------------- */
function MainTabs() {
  const { colors: c } = useThemeStyles();

  return (
    <Tab.Navigator
      initialRouteName="Account"
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.backgroundAlt,
          borderTopWidth: 1,
          borderTopColor: c.border,
          height: 80,
          paddingTop: 15,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
      })}
    >
      <Tab.Screen
        name="Routes"
        component={RoutesStack}
        options={{
          tabBarIcon: ({ color }) => (
            <Image
              source={require("../assets/icons/RouteSelectLight.png")}
              style={{
                width: 48,
                height: 48,
                resizeMode: "contain",
                tintColor: color,
              }}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Map"
        component={MapStack}
        options={{
          tabBarIcon: ({ color }) => (
            <Image
              source={require("../assets/icons/MapLight.png")}
              style={{
                width: 48,
                height: 48,
                resizeMode: "contain",
                tintColor: color,
              }}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountStack}
        options={{
          tabBarIcon: ({ color }) => (
            <Image
              source={require("../assets/icons/AccountLight.png")}
              style={{
                width: 48,
                height: 48,
                resizeMode: "contain",
                tintColor: color,
              }}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Files"
        component={FileManagerScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Image
              source={require("../assets/icons/FilesLight.png")}
              style={{
                width: 44,
                height: 44,
                resizeMode: "contain",
                tintColor: color,
              }}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/* ----------------------------
   Root Stack (Auth + Main)
---------------------------- */
export default function AppNavigator() {
  const { userToken, isLoading } = useAuth();
  const { navTheme } = useThemeStyles();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {userToken ? (
          // Logged-in flow
          <Stack.Screen name="MainTabs" component={MainTabs} />
        ) : (
          // Auth flow
          <>
            <Stack.Screen name="Landing" component={LandingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen
              name="AccountCreation"
              component={AccountCreationScreen}
            />
            {/* once they log in, you can navigate to MainTabs */}
            <Stack.Screen name="MainTabs" component={MainTabs} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
