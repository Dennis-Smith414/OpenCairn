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

    For local development, see `Server/README.md` for a quick Docker-based setup and an example `.env` file (`Server/.env.example`).

    One-command setup (recommended)
    ------------------------------

    If you'd like to get up and running quickly, use the repo Makefile to install dependencies and bootstrap the local environment.

    From the project root:

    ```bash
    # install all service dependencies
    make install-all

    # start DB + server in background and wait for DB to be ready
    make bootstrap
    ```

    Then start the client and mobile dev servers in separate terminals:

    ```bash
    make client-dev
    make mobile-dev

    Create a test user quickly
    -------------------------
    To create a local developer test user you can run (from repo root):

    ```bash
    # adds user 'tester' with password 'Test!123' (safe for local dev only)
    make seed-user
    ```

    You can change the username/password/email using environment variables:

    ```bash
    make seed-user USERNAME=alice EMAIL=alice@example.com PASS="S3cure!Pass"
    ```
    ```

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

    Requirement: docker compose
    ---------------------------

    This repository requires the Docker CLI plugin `docker compose` (not the older
    python-based `docker-compose`). The Makefile and docker workflows expect the
    `docker compose` subcommand to be available and will fail with an actionable
    error if it isn't.

    Preflight checks and troubleshooting
    -------------------------------

    This repo includes a small preflight check script at `scripts/preflight.sh` which validates that:

    - `docker` is installed and reachable
    - either the modern `docker compose` plugin or legacy `docker-compose` is available
    - the Docker daemon is running and the DOCKER_HOST environment isn't using an unsupported scheme (e.g. `http+docker://`)

    Use the script directly:

    ```bash
    ./scripts/preflight.sh
    ```

    Or run the Makefile wrapper `make preflight` which invokes it for you.

    If the preflight fails it will print helpful tips and links so you can install or fix Docker / Compose.

    Troubleshooting Docker / docker-compose
    -------------------------------------

    If you encounter errors like "Not supported URL scheme http+docker" when running `make up` or `docker-compose up`, try the following:

    - Use the Docker CLI plugin instead of the legacy python `docker-compose`:
        ```bash
        # preferred (newer Docker)
        docker compose up --build -d
        ```

    - Check and (temporarily) unset an invalid DOCKER_HOST value in your shell:
        ```bash
        echo $DOCKER_HOST  # see if set
        unset DOCKER_HOST  # clear for current session
        ```

    - Confirm Docker daemon is running on Linux:
        ```bash
        systemctl status docker
        docker --version
        docker context ls
        ```

    If you prefer, the Makefile now prefers `docker compose` when available and will fall back to `docker-compose` automatically.
    **NOTE:** (This command uses `react-native run-android`. Follow any prompts that appear in the terminal or on your device).

Makefile shortcuts
------------------

There is a repo-level `Makefile` with handy shortcuts for development. Examples (run from repo root):

```bash
# Start DB + server in background
make up

Note: after `make up` completes the command prints a short summary showing useful host URLs and ports for the stack (backend API, Postgres). This makes it easy to see where to connect without scanning compose output.

Troubleshooting "Failed to fetch / ERR_CONNECTION_REFUSED" on login
----------------------------------------------------------------
If the browser shows "Failed to fetch" or ERR_CONNECTION_REFUSED when hitting the login endpoint from the web client (e.g. visiting http://localhost:5174/login):

1) Ensure the backend is running and reachable. The local backend listens on port 5100 by default (this repo uses 5100 not 5000):

```bash
# start server+db
make up
# or run the server directly
cd Server && npm run dev
```

2) Make sure the client is pointing to the correct backend URL. The client defaults to http://localhost:5100 and the Vite proxy sends /api/* to the backend. If you changed ports, set VITE_API_BASE in the client or run `make client-dev PORT=<port>` to override the web dev server port.

3) Check browser devtools (Network) and server logs for connection attempts and errors.

4) If login fails due to invalid credentials, register a new user first (Register page) or create a test user in the database.

# Start DB + server in foreground (shows logs in this terminal)
make up-foreground

# Start DB + server in background, then run client and mobile in separate shells
make full-up

Note: `make full-up` will now wait for the backend to report healthy on /api/health. If your web client dev server is already running on a Vite dev port (5173, 5174, 5175), the Makefile will detect the first active port and attempt to open your browser at the detected http://localhost:<port>. You can override the browser command with the BROWSER environment variable (or use your system's `xdg-open` / `open`).

# Run the web client locally
make client-dev

If you already have another process on port 5173 (for example another app), Vite will automatically try the next free port (5174, 5175, ...). To explicitly start the web client on a chosen port run:

```bash
# pick port 5174 explicitly
make client-dev PORT=5174
```

# Run the mobile (metro) server locally
make mobile-dev

# Run server locally (dev mode)
make server-dev

# Stop and remove everything
make down

# Tear down including volumes (removes database data)
make clean
```

## Authors and Acknowledgements

* Dennis
* Aaron
* Tyler
* Felix
* Ethan
