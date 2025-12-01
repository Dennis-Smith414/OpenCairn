# Open Cairn Docs

These docs will be split between outlining our app's features as seen to an end user, alongside an overview of our code structure.

## Home page

```/NodeMobile/src/screens/LandingScreen.tsx```

Two buttons that redirect to the login page and the account creation page. 



## Account creation page

```/NodeMobile/src/screens/AccountCreationScreen.tsx```

Allows users to create an account hosted on our remote server. Includes fields for username, email, and password.
The password isn't accepted unless it's 8+ characters with an uppercase and special character.

We don't have a mail server set up, so any email allowed, and a user can immediately log in after creating their account without
verifying their email.

Users can't create accounts with a username or email of an account that already exists.



## Login page

```/NodeMobile/src/screens/LoginScreen.tsx```

Username and password entry fields, and a "remember me" toggle.

Entering invalid credentials five times in a row causes the user to be locked out for five minutes.
While locked out, the username and password are not sent to the server for verification and any login attempt fails.



