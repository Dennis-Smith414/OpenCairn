import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AccountCreationScreen from "../screens/AccountCreationScreen";
import MapTest from '../screens/MapTest'; //Map Test.tsx file
import LoginScreen from '../screens/LoginScreen';

import LandingScreen from "../screens/LandingScreen";
// import HomeScreen from "../screens/HomeScreen"; // add later when ready

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Landing">
        <Stack.Screen
          name="Landing"
          component={LandingScreen}
          options={{ title: "Welcome" }}
        />
        <Stack.Screen name="Map_test" component={MapTest} />
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
        {/* <Stack.Screen name="Home" component={HomeScreen} /> */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
