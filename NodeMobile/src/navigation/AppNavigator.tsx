import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AccountCreationScreen from "../screens/AccountCreationScreen";
import MapTest from "../screens/MapTest";
import TrailsListScreen from "../screens/TrailsListScreen";
import TrailMapScreen from "../screens/TrailMapScreen";
import LandingScreen from "../screens/LandingScreen";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Landing">
        <Stack.Screen
          name="Landing"
          component={LandingScreen}
          options={{ headerShown: false }} // hide header for landing
        />
        <Stack.Screen
          name="TrailsList"
          component={TrailsListScreen}
          options={{ title: "Trails" }}
        />
        <Stack.Screen
          name="TrailMap"
          component={TrailMapScreen}
          options={({ route }: any) => ({
            title: route.params?.name ?? "Trail Map",
          })}
        />
        <Stack.Screen
          name="MapTest"
          component={MapTest}
          options={{ title: "Map Test" }}
        />
        <Stack.Screen
          name="CreateAccount"
          component={AccountCreationScreen}
          options={{ title: "Create Account" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
