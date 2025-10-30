# Open Cairn

<p align="center">
  OpenCairn is a community-driven trail mapping app where users can create, share, and 
  follow routes enhanced with crowdsourced, votable waypoints 
</p>

## 📖 About

OpenCairn is a collaborative trail guide that allows hikers, bikers, and explorers to map out new routes or follow existing ones. Its core feature is the ability for any user to place "digital cairns"—waypoints that mark points of interest, hazards, or tips. These waypoints are visible to the entire community and can be upvoted or downvoted, ensuring that trail information is always relevant, reliable, and crowd-verified.

## ✨ Features

* **Trail Creation:** Easily map, record, and save your own trails for personal use or to share with the community.
* **Trail Discovery:** Browse and follow a library of pre-existing routes created by other OpenCairn users.
* **Crowdsourced Waypoints:** Place "digital cairns" (waypoints) on any trail to mark points of interest, hazards, water sources, or scenic views.
* **Community Voting:** All waypoints are visible to everyone and can be upvoted or downvoted, ensuring the most helpful and accurate information rises to the top.

## 🛠️ Technology Stack

**Web Client (client):** 
* Framework: React
* Language: TypeScript
* Build Tool: Vite
* Mapping: Leaflet (with react-leaflet)
* Routing: React Router

**Mobile App (NodeMobile):**
* Framework: React Native
* Language: TypeScript
* Navigation: React Navigation
* Mapping/Geo: React Native Maps, React Native Leaflet View, @react-native-community/geolocation
* Core: nodejs-mobile-react-native (runs Node.js on device)

**Backend (Server):**
* Runtime: Node.js
* Framework: Express.js
* Database: PostgreSQL (hosted on Neon), SQLite
* Geospatial: Turf.js
* Authentication: JWT (jsonwebtoken), bcryptjs
* File Handling: Multer, gpx-parse

**Primary Languages: TypeScript, JavaScript (HTML/CSS are implied for frontends)**

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.


### Prerequisites

* **[Node.js](https://nodejs.org/) (Version >= 20):** Required for the Server, Web Client, and Mobile App. Comes with **npm** (Node Package Manager).
* **[PostgreSQL](https://www.postgresql.org/):** The database used by the backend server. (Note: This project uses a hosted instance on Neon, but local setup requires a PostgreSQL installation or Docker).
* **Android Development Environment (for Mobile App):**
    * Follow the **official React Native guide** for setting up your development environment for **Android**: [React Native Environment Setup - Android Tab](https://reactnative.dev/docs/environment-setup?os=linux&platform=android)
    * This includes installing **[Android Studio](https://developer.android.com/studio)**, the Android SDK, and configuring environment variables.

## 💾 Installation

1.  **Clone the repository:**
    ```sh
    git clone [https://github.com/Dennis-Smith414/CS595-Capstone.git](https://github.com/Dennis-Smith414/CS595-Capstone.git)
    cd CS595-Capstone 
    ```

2.  **Install Server Dependencies:**
    ```sh
    cd Server
    npm install
    cd .. 
    ```

3.  **Install Web Client Dependencies:**
    ```sh
    cd client
    npm install
    cd ..
    ```

4.  **Install Mobile App Dependencies:**
    ```sh
    cd NodeMobile
    npm install
    cd ..
    ```

5.  **Set up Server Environment Variables:**
    * Navigate to the `Server` directory.
    * Create a file named `.env`.
  
        ```env
        # Example .env file for the Server
        DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require" 
        JWT_SECRET="your_very_secret_key_here"
        ```
    * *(**Important:** Make sure your `.gitignore` file includes `.env` to avoid committing secrets!)*

6.  **Database Setup (Server):**
    * Ensure your PostgreSQL database (e.g., your Neon instance) is running and accessible.

## ▶️ Usage

To run the full application, you'll typically need to start the backend server, the web client, and the mobile app separately, often in different terminal windows.

### 1. Running the Backend Server

* Navigate to the `Server` directory:
    ```sh
    cd Server
    ```
* Start the server (usually in development mode):
    ```sh
    npm run dev 
    ```
    **NOTE:** (This command uses `node index.js` as defined in `Server/package.json`. The server will likely run on `http://localhost:5001`).

### 2. Running the Web Client

* Open a **new terminal window/tab**.
* Navigate to the `client` directory:
    ```sh
    cd client
    ```
* Start the development server:
    ```sh
    npm run dev
    ```
    **NOTE:** (Vite will usually start the web app on `http://localhost:5173` or a similar port. Check the terminal output for the exact URL).
* Open the URL provided by Vite in your web browser.

### 3. Running the Mobile App (Android)

* **Ensure you have an Android Emulator running** or a physical Android device connected and configured for development.
* Open a **new terminal window/tab**.
* Navigate to the `NodeMobile` directory:
    ```sh
    cd NodeMobile
    ```
* Start the Metro bundler (React Native's JavaScript bundler):
    ```sh
    npm start
    ```
* Open **another new terminal window/tab** (while Metro is running).
* Navigate to the `NodeMobile` directory again:
    ```sh
    cd NodeMobile
    ```
* Build and run the app on your emulator or device:
    ```sh
    npm run android
    ```
    **NOTE:** (This command uses `react-native run-android`. Follow any prompts that appear in the terminal or on your device).

## Authors and Acknowledgements

* Dennis
* Aaron
* Tyler
* Felix
* Ethan
