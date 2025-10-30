import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Image, View, ActivityIndicator } from "react-native";
import { useAuth } from "../context/AuthContext";

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
    <AccountStackNav.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
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
    <MapStackNav.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <MapStackNav.Screen name="MapMain" component={MapScreen} />
      <MapStackNav.Screen
        name="WaypointCreate"
        component={WaypointCreateScreen}
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
    </MapStackNav.Navigator>
  );
}

/* ----------------------------
   Routes Stack
---------------------------- */
function RoutesStack() {
  return (
    <RoutesStackNav.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <RoutesStackNav.Screen name="RoutesMain" component={RouteSelectScreen} />
      <RoutesStackNav.Screen
        name="RouteCreate"
        component={RouteCreateScreen}
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
    </RoutesStackNav.Navigator>
  );
}

/* ----------------------------
   Main Tab Navigator
---------------------------- */
function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Account"
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#fff",
          height: 80,
          paddingTop: 15,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: "#008b8b",
        tabBarInactiveTintColor: "#000",
      }}
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

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {userToken == null ? (
          <>
            <Stack.Screen name="Landing" component={LandingScreen} />
            <Stack.Screen name="CreateAccount" component={AccountCreationScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="WaypointEdit"
              component={WaypointEditScreen}
              options={{ title: "Edit Waypoint", headerShown: false }} // or true if you want RN header
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
