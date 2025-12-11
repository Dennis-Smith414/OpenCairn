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
