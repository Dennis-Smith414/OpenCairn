# Open Cairn Docs

These docs will be split between outlining our app's features as seen to an end user, alongside an overview of our code structure.

## Home screen

```/NodeMobile/src/screens/LandingScreen.tsx```

Two buttons that redirect to the login page and the account creation page. 



## Account creation screen

```/NodeMobile/src/screens/AccountCreationScreen.tsx```

Allows users to create an account hosted on our remote server. Includes fields for username, email, and password.
The password isn't accepted unless it's 8+ characters with an uppercase and special character.

We don't have a mail server set up, so any email is allowed, and a user can immediately log in after creating their account without
verifying their email.

Users can't create accounts with a username or email of an account that already exists.



## Login screen

```/NodeMobile/src/screens/LoginScreen.tsx```

Username and password entry fields, and a "remember me" toggle.

Entering invalid credentials five times in a row causes the user to be locked out for five minutes.
While locked out, the username and password are not sent to the server for verification and any login attempt fails.



## Account screen

```/NodeMobile/src/screens/AccountScreen.tsx```

Where the user is sent after logging in.
Includes account information (username, email, total engagement statistics) as well as lists of all routes, waypoints and comments by the user.
These lists have search functionality.
Also, links to settings page.



## Settings screen

```/NodeMobile/src/screens/SettingsScreen.tsx```

Settings for imperial versus metric distance, dark mode toggle, and log out button.



## Route select screen

```/NodeMobile/src/screens/RouteSelectScreen.tsx```

Browse routes created by anyone in the Open Cairn community.
Searchable by distance, name, and/or region.
Routes can be favorited to easily find them later.



## Route detail screen

```/NodeMobile/src/screens/RouteDetailScreen.tsx```

Shows more information about a specific route than what's shown on the route select screen.
Creator, date created, and component GPX files.

Also the screen that allows users to comment on routes.

Includes buttons to add the route onto the map for the current session, as well as save the GPX files to the phone's local storage for use offline.



## Map screen

```/NodeMobile/src/screens/MapScreen.tsx``` and ```/NodeMobile/src/components/TripTracker/TripTracker.tsx```

Displays phone's location on a  world map, along with routes added from the route detail screen.
If there are any routes on the map, also includes a trip tracker sub-window, if the user wants to follow an existing route.



## File manager screen

```/NodeMobile/src/screens/FileManagerScreen.tsx``` and ```/NodeMobile/src/components/files/OfflineRoutesList.tsx```

Toggles between whether the routes displayed are coming from our remote server or the phone's local offline storage.
Includes a list of downloaded routes that can currently be used offline.

---

```/NodeMobile/src/assets```

Various fonts and graphics used throughout the application.

---

```/NodeMobile/src/components/account```

UI elements specific to the account screen; used to displaying the user's routes, waypoints, and comments.

---

```/NodeMobile/src/components/comments```

Reusable UI elements related to comments.
One used in the account screen with the list of all comments, and one in the route detail screen for posting a comment.

---

```/NodeMobile/src/components/common```

UI elements that are more generic and reused throught the app.

---

```/NodeMobile/src/components/files```

Contains the list UI element for offline routes, used only in the file manager screen.

---

```/NodeMobile/src/components/MapLibre```

UI and logic for navigating the map screen, which includes making waypoints selectable, with a popup giving details about the waypoint.

---

```/NodeMobile/src/components/routes```

Code that generates a thumbnail for each route, which is simply the shape of the GPX files on the map, without any background context from the map.
Also includes a reusable UI element representing one route on the route select screen.

---

```/NodeMobile/src/components/TripTracker```

As explained previously, overlays a trip tracker UI on the map when at least one route is selected.

---

```/NodeMobile/src/context```

Various contexts are passed around between screens so that the app can both have persistent state and navigate from screen to screen.

---

```/NodeMobile/src/hooks/useGeolocation.tsx```

Manages the Android permissions for getting the user's location, and then continually watches their location.

---

```/NodeMobile/src/navigation/AppNavigator.tsx```

Holds previously visited screens in a stack so that the app works as expected with the built-in Android back button.

---

```/NodeMobile/src/styles```

Rather than define colors, allignment, and so on in every individual screen, each screen draws from the styles in this folder.
