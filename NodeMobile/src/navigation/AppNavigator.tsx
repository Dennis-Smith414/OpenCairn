// AppNavigator.tsx
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, Image, View, ActivityIndicator } from "react-native";
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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Bottom tabs for main app
function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Account"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
            backgroundColor: "#fff",
            height: 80,
            paddingTop : 10,
            },
        tabBarShowLabel: false,
        tabBarActiveTintColor: "#008b8b",
        tabBarInactiveTintColor: "#000",
      }}
    >
      <Tab.Screen
              name="Routes"
              component={RouteSelectScreen}
              options={{
                tabBarIcon: ({ color }) => (
                  <Image
                    source={require("../assets/icons/RouteSelectLight.png")}
                    style={{
                        width: 44,
                        height: 44,
                        resizeMode: "contain",
                        tintColor : color,
                    }}
                  />
                ),
              }}
            />
      <Tab.Screen
              name="Map"
              component={MapScreen}
              options={{
                tabBarIcon: ({ color }) => (
                  <Image
                    source={require("../assets/icons/MapLight.png")}
                    style={{
                        width: 44,
                        height: 44,
                        resizeMode: "contain",
                        tintColor : color,
                    }}
                  />
                ),
              }}
            />
      <Tab.Screen
              name="Account"
              component={AccountScreen}
              options={{
                tabBarIcon: ({ color }) => (
                  <Image
                    source={require("../assets/icons/AccountLight.png")}
                    style={{
                        width: 44,
                        height: 44,
                        resizeMode: "contain",
                        tintColor : color,
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
                        width: 40,
                        height: 40,
                        resizeMode: "contain",
                        tintColor : color,
                    }}
                  />
                ),
              }}
            />
    </Tab.Navigator>
  );
}

// Root stack for auth + main app
export default function AppNavigator() {
    const { userToken, isLoading } = useAuth();


// Show a loading screen while the app checks for a token on startup
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {userToken == null ? (
          // No token found, show the screens for logged-out users
          <>
            <Stack.Screen
              name="Landing"
              component={LandingScreen}
              options={{ headerShown: false }}
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
          </>
        ) : (
          // User is signed in, show the main app screens
          <>
            <Stack.Screen
              name="Main"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="RouteCreate"
              component={RouteCreateScreen}
            />
            <Stack.Screen
            name="WaypointCreate"
            component={WaypointCreateScreen}
            options={{ presentation: "modal", title: "Create Waypoint" }}
            />
          </>
          
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}