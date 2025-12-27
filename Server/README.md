# Server (backend) — local development

This folder contains the Node/Express backend. The server requires a PostgreSQL database and expects the database connection string to be in the environment variable `DATABASE_URL`.

If you want to run the server locally for development, here are quick steps using Docker (recommended) so you don't need to install Postgres on your host.

1) Copy the example: create a `.env` file in the `Server/` directory from `.env.example`.

2) Start a local Postgres container (this creates a user `app`, password `pass`, and database `trails`):

```bash
docker run --name oc-postgres -e POSTGRES_USER=app -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=trails -p 5432:5432 -d postgres:15
```

3) Verify Postgres is running and reachable (optional):

```bash
# run a quick test script that uses DATABASE_URL
cd Server
DATABASE_URL="postgres://app:pass@localhost:5432/trails" node test-pg.js
```

4) Start the backend server (server will read `Server/.env` automatically):

```bash
cd Server
# either set DATABASE_URL in your shell then start
export DATABASE_URL="postgres://app:pass@localhost:5432/trails"
export JWT_SECRET="dev-secret-change-me"
npm run dev

# or create Server/.env with those values and just run
npm run dev
```

5) When you are finished, stop and remove the container:

```bash
docker stop oc-postgres && docker rm oc-postgres
```

Notes
- The repository already contains a `test-pg.js` script (simple connection test) and the app's schema will be created automatically at startup by `Postgres.init()`.
- **Do not commit** your `.env` file containing real credentials. Use `.env.example` instead.

Docker Compose (recommended)

The repository includes a `docker-compose.yml` at the project root that brings up both a Postgres DB and the backend together. This is the easiest way to get the full stack running for development. This project requires the modern Docker CLI plugin `docker compose` (not the older `docker-compose`).

Before running any compose targets, you can run the preflight script to validate your Docker environment:

```bash
./scripts/preflight.sh
# or via the Makefile
make preflight
```

Start everything:

```bash
docker-compose up --build
```

After `make up` completes successfully, the Makefile prints a short summary showing the host endpoints (backend URL and postgres connection string) so you can quickly connect from your host machine.

If your web client port (5173) is already in use on the host, Vite will usually select the next free port (e.g. 5174). To explicitly start the client on a chosen port use:

```bash
make client-dev PORT=5174
```

Quick login testing notes
-------------------------
There are no pre-seeded test users in the database. To test logging in from the web UI you can either:

- Register a new user via the client /register page and then log in from /login, or
- Insert a row directly into the `users` table using psql and a password hashed with bcrypt, or
- Use a short script to create a sample user for development.

Or use the repo Makefile to create a test user easily (from repo root):

```bash
# create default user 'tester' with password 'Test!123'
make seed-user
```

To customize the seeded user, pass environment variables to the Make target:

```bash
make seed-user USERNAME=alice EMAIL=alice@example.com PASS="S3cure!Pass"
```

If the client shows "Failed to fetch" or ERR_CONNECTION_REFUSED while trying to reach `/api/auth/login`, confirm the backend is running on port 5100 and that `DATABASE_URL`/JWT_SECRET are set appropriately for the server.

Important for Docker users
------------------------
If you're running the server inside Docker (via `make up` / `docker-compose`), make sure `DATABASE_URL` points to the service name `db` (not `localhost`) because inside a container `localhost` refers to the container, not the host. Example for compose:

```
DATABASE_URL="postgres://app:pass@db:5432/trails"
```

If you have a `Server/.env` file with a `DATABASE_URL` set to localhost, the server container will use that value and fail to reach the database container. Either remove or update that file to point at `db` when using the compose setup.
Stop and remove containers, networks and volumes created by compose:

```bash
docker-compose down -v
```

Makefile (convenience)
----------------------

From the project root you can use the included `Makefile` for convenient commands that wrap `docker-compose` and local dev helpers. Examples:

Start the full stack (DB + server):

```bash
make up
```

Stop everything:

```bash
make down
```

Start only the DB service:

```bash
make db-up
```

Run a quick connectivity test locally (uses Server/test-pg.js):

```bash
make test-pg
```

Run the server locally from source (installs deps and starts):

```bash
make server-dev
```

For more targets and descriptions run `make help` at the repository root.

Additional Make targets
-----------------------

The Makefile includes several helpful targets you can run from the repository root:

- `make ensure-server-env` — create `Server/.env` from `Server/.env.example` if you don't have one yet.
- `make wait-db` — wait (up to ~30s) for the DB container to become ready (pg_isready).
- `make reset-db` — remove the database volume and bring up only the DB service (useful to reset test data).

These make tasks are non-destructive unless you run `make clean` which will remove volumes produced by compose.

Quick one-command developer bootstrap
-----------------------------------

If you want a fast developer bootstrap from the repo root, run:

```bash
make install-all   # installs npm deps for server, client, and mobile
make bootstrap     # ensures Server/.env, starts DB+server and waits for DB readiness
```

After this, open two more terminal windows and run `make client-dev` and `make mobile-dev` to start the client and mobile dev servers respectively.

SSL notes
The backend previously forced SSL for all connections which made local Postgres (without TLS) fail. The server now respects `DB_SSL=true` or a DATABASE_URL that contains `sslmode=require`. For the provided local compose setup we disable SSL (DB_SSL=false). If you point `DATABASE_URL` at a cloud provider that requires TLS (Neon, Heroku, etc.) set `DB_SSL=true` or include `?sslmode=require` in the URL.
