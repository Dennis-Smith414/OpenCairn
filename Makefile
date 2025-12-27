# Makefile — helper targets for local development
#
# Helpful targets:
#   make up              -> Build images and start server + db (docker-compose up --build -d)
#   make down            -> Stop and remove containers (docker-compose down)
#   make build           -> Build docker-compose images
#   make restart         -> Restart the stack
#   make logs            -> Follow all docker-compose logs
#   make ps              -> List docker-compose containers
#
#   make db-up           -> Start only the database service
#   make db-stop         -> Stop only the database service
#   make db-shell        -> Open psql shell inside the db container
#
#   make server-up       -> Start only the server service
#   make server-dev      -> Run server locally (in development mode)
#
#   make test-pg         -> Quick local DB connection check (runs Server/test-pg.js)
#   make test-pg-compose -> Run the same inside the server container
#
.PHONY: help up full-up up-foreground down build restart logs ps logs-server logs-db db-up db-stop db-shell wait-db reset-db ensure-server-env server-up server-dev client-dev client-build mobile-dev mobile-android install-server install-client install-mobile install-all seed-user bootstrap test-pg test-pg-compose clean

## Prefer the modern `docker compose` plugin when available, otherwise fall back
## to the legacy `docker-compose` command. This avoids errors while still being
## forgiving on systems that only have the older tool installed.
ifeq ($(shell docker compose version >/dev/null 2>&1 && echo ok),ok)
DC := docker compose
else ifeq ($(shell command -v docker-compose >/dev/null 2>&1 && echo ok),ok)
DC := docker-compose
else
DC := docker compose
endif

# Preflight script (optional) to check docker / compose prerequisites
PRECHECK := ./scripts/preflight.sh

preflight: ## Run preflight script to check docker prerequisites
	@[ -f $(PRECHECK) ] || (echo "[preflight] $(PRECHECK) not found — create or check scripts/ directory" && exit 1)
	@chmod +x $(PRECHECK) >/dev/null 2>&1 || true
	@$(PRECHECK)

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS=":.*?## "}; {printf "%-20s %s\n", $$1, $$2}'


up: ## Build and start server + db in background, wait for DB and print useful URLs
	$(MAKE) preflight
	$(DC) up --build -d
	$(MAKE) wait-db
	@echo ""
	@echo "[stack] ✅ Local stack is up — useful endpoints (host)"
	@server_port=$$($(DC) port server 5100 2>/dev/null | awk -F':' '{print $$NF}' || true); \
	if [ -z "$$server_port" ]; then server_port=5100; fi; \
	echo "  • Backend API: http://localhost:$$server_port/ (exposes port $$server_port)"; \
	db_port=$$($(DC) port db 5432 2>/dev/null | awk -F':' '{print $$NF}' || true); \
	if [ -z "$$db_port" ]; then db_port=5432; fi; \
	echo "  • Postgres: postgres://app:pass@localhost:$$db_port/trails"; \
		# detect whether a Vite dev port (5173, 5174, 5175) is already in use on the host
		CLIENT_PORT=""; \
		for p in 5173 5174 5175; do \
			if nc -z 127.0.0.1 $$p >/dev/null 2>&1; then CLIENT_PORT=$$p; break; fi; \
		done; \
		if [ -n "$$CLIENT_PORT" ]; then \
			echo "  • Web client (dev): http://localhost:$$CLIENT_PORT  (detected a dev server on this port)"; \
		else \
			echo "  • Web client (dev): http://localhost:5173  (start with 'make client-dev' if needed - you can pass PORT= to choose a different port)"; \
		fi; \
	echo "  • Mobile (Metro): run 'make mobile-dev' in a separate terminal for the Metro dev server"; \
	echo ""

full-up: ## Build and start server + db in background. Client/mobile should be run from their directories in separate shells (see client-dev / mobile-dev)
	@echo "Starting server+db in background. Run 'make client-dev' and 'make mobile-dev' in separate shells if needed."
	$(MAKE) preflight
	$(DC) up --build -d
	$(MAKE) wait-db
	# Wait for the backend health check so clients can rely on /api/health
	$(MAKE) wait-health || true
	@echo ""
	@echo "[stack] ✅ Local stack is up — useful endpoints (host)"
	@server_port=$$($(DC) port server 5100 2>/dev/null | awk -F':' '{print $$NF}' || true); \
	if [ -z "$$server_port" ]; then server_port=5100; fi; \
	echo "  • Backend API: http://localhost:$$server_port/ (exposes port $$server_port)"; \
	db_port=$$($(DC) port db 5432 2>/dev/null | awk -F':' '{print $$NF}' || true); \
	if [ -z "$$db_port" ]; then db_port=5432; fi; \
	echo "  • Postgres: postgres://app:pass@localhost:$$db_port/trails"; \
		# detect whether a Vite dev port (5173, 5174, 5175) is already in use on the host
		CLIENT_PORT=""; \
		for p in 5173 5174 5175; do \
			if nc -z 127.0.0.1 $$p >/dev/null 2>&1; then CLIENT_PORT=$$p; break; fi; \
		done; \
		if [ -n "$$CLIENT_PORT" ]; then \
			echo "  • Web client (dev): http://localhost:$$CLIENT_PORT  (detected a dev server on this port)"; \
		else \
			echo "  • Web client (dev): http://localhost:5173  (start with 'make client-dev' if needed - you can pass PORT= to choose a different port)"; \
		fi; \

	# If the client dev server is running on any of the known ports, try opening it
	if [ -n "$$CLIENT_PORT" ]; then \
		url="http://localhost:$$CLIENT_PORT"; \
		echo "  • Attempting to open web client at $$url"; \
		if [ -n "$$BROWSER" ]; then \
			( $$BROWSER "$$url" >/dev/null 2>&1 || true ) &>/dev/null || true; \
		elif command -v xdg-open >/dev/null 2>&1; then \
			xdg-open "$$url" >/dev/null 2>&1 || true; \
		elif command -v open >/dev/null 2>&1; then \
			open "$$url" >/dev/null 2>&1 || true; \
		else \
			echo "    (No known 'open' command found — please open $$url in your browser)"; \
		fi; \
	else \
		echo "  • Client dev server not detected on ports 5173/5174/5175 — run 'make client-dev PORT=5174' and then open the URL your client reports (or start it on 5173 if you prefer)"; \
	fi; \
	echo "  • Mobile (Metro): run 'make mobile-dev' in a separate terminal for the Metro dev server"; \
	echo ""

up-foreground: ## Start compose in foreground (no -d). This is useful if you want to watch logs in this terminal.
	$(MAKE) preflight
	$(DC) up --build

down: ## Stop and remove containers
	$(MAKE) preflight
	$(DC) down

build: ## Build compose images
	$(MAKE) preflight
	$(DC) build

restart: ## Restart the full stack
	$(MAKE) preflight
	$(DC) down && $(DC) up --build -d

logs: ## Follow docker-compose logs
	$(MAKE) preflight
	$(DC) logs -f --tail=200

logs-server: ## Follow logs for only the server service
	$(MAKE) preflight
	$(DC) logs -f --tail=200 server

logs-db: ## Follow logs for only the db service
	$(MAKE) preflight
	$(DC) logs -f --tail=200 db

ps: ## List running compose services
	$(MAKE) preflight
	$(DC) ps

# Database only helpers
db-up: ## Start only the db service
	$(MAKE) preflight
	$(DC) up -d db

db-stop: ## Stop the db service
	$(MAKE) preflight
	$(DC) stop db

db-shell: ## Open psql shell in the db container (user: app, db: trails)
	$(MAKE) preflight
	$(DC) exec db psql -U app -d trails

wait-db: ## Wait for the database service to be ready (pg_isready). Fails after ~30s
	$(MAKE) preflight
	@i=0; until $(DC) exec db pg_isready -U app -d trails >/dev/null 2>&1 || [ $$i -ge 30 ]; do \
		echo waiting for db...; sleep 1; i=$$((i+1)); \
	done; \
	if [ $$i -ge 30 ]; then echo "Timed out waiting for db" && exit 1; else echo "DB ready"; fi

wait-health: ## Wait for backend /api/health to return ok JSON. Fails after ~30s
	$(MAKE) preflight
	@i=0; until ( curl -sSf -m 2 $${HEALTH_URL:-http://localhost:5100/api/health} | grep -q '"ok"' ) || [ $$i -ge 30 ]; do \
		echo waiting for /api/health...; sleep 1; i=$$((i+1)); \
	done; \
	if [ $$i -ge 30 ]; then echo "Timed out waiting for /api/health" && exit 1; else echo "/api/health OK"; fi

reset-db: ## Remove DB data (volumes) and recreate only the DB service
	$(MAKE) preflight
	$(DC) down -v db || true
	$(DC) up -d db
	$(MAKE) wait-db

ensure-server-env: ## Ensure Server/.env exists, copying from example if missing
	@test -f Server/.env || (cp Server/.env.example Server/.env && echo "created Server/.env from .env.example — edit as needed")

# Server helpers
server-up: ## Start only the server service
	$(MAKE) preflight
	$(DC) up -d server

server-dev: ## Run the server locally from the working tree (useful for debugging)
	cd Server && npm ci --no-audit --no-fund && npm run dev

# Client helpers
client-dev: ## Run the web client locally (dev server). Use PORT=<port> to override (eg PORT=5174)
	cd client && npm ci --no-audit --no-fund && PORT=${PORT:-5173} npm run dev

client-build: ## Build the web client (production)
	cd client && npm ci --no-audit --no-fund && npm run build

# Mobile helpers (NodeMobile)
mobile-dev: ## Run the React Native metro server for NodeMobile
	cd NodeMobile && npm ci --no-audit --no-fund && npm start

mobile-android: ## Build & run the React Native Android app (requires emulator/device)
	cd NodeMobile && npm ci --no-audit --no-fund && npm run android

# Install helpers
install-server: ## Install server deps (Server/package.json)
	cd Server && npm ci --no-audit --no-fund

install-client: ## Install client deps (client/package.json)
	cd client && npm ci --no-audit --no-fund

install-mobile: ## Install mobile deps (NodeMobile/package.json)
	cd NodeMobile && npm ci --no-audit --no-fund

install-all: ## Install all service dependencies (server, client, mobile)
	$(MAKE) install-server
	$(MAKE) install-client
	$(MAKE) install-mobile

seed-user: ## Create a test user in the DB for local development (defaults: tester / Test!123)
	@USERNAME=$${USERNAME:-tester}; EMAIL=$${EMAIL:-tester@example.com}; PASS=$${PASS:-Test!123}; \
	HASH=$$(docker compose exec -T server env PASS="$$PASS" node -e "console.log(require('bcryptjs').hashSync(process.env.PASS, 10))" 2>/dev/null || docker-compose exec -T server env PASS="$$PASS" node -e "console.log(require('bcryptjs').hashSync(process.env.PASS, 10))"); \
	echo "Creating user $$USERNAME <$$EMAIL> with password $$PASS"; \
	printf "INSERT INTO users (username,email,password_hash) VALUES ('%s','%s','%s');\n" "$$USERNAME" "$$EMAIL" "$$HASH" | docker compose exec -T db psql -U app -d trails -q || printf "INSERT INTO users (username,email,password_hash) VALUES ('%s','%s','%s');\n" "$$USERNAME" "$$EMAIL" "$$HASH" | docker-compose exec -T db psql -U app -d trails -q || true

# Bootstrap helper — ensure server env, install deps, start DB/server and wait
bootstrap: ## Prepare a local dev environment: ensure env, install deps and start server+db
	$(MAKE) ensure-server-env
	$(MAKE) install-all
	$(MAKE) up
	$(MAKE) wait-db
	@echo "Bootstrapped: server+db are running. Run 'make client-dev' and 'make mobile-dev' in separate terminals to start the client and mobile dev servers."

# quick database test
test-pg: ## Run test-pg.js locally against localhost Postgres
	@DATABASE_URL="postgres://app:pass@localhost:5432/trails" node Server/test-pg.js || true

test-pg-compose: ## Run test-pg.js inside the server container (requires server to be running)
	$(MAKE) preflight
	$(DC) exec server node test-pg.js

clean: ## Stop and remove containers + volumes (careful: removes db-data volume)
	$(MAKE) preflight
	$(DC) down -v
