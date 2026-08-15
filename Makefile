# ai-os, from a cold machine to a working desk.
#
# The stack is four things — Postgres, core, flows, the desk — and starting it
# used to be four terminals and a Docker command you had to remember. That is
# not a technical problem, it is the reason you do not open it on a Tuesday.
#
#   make up       start everything, wait until it answers, print the URL
#   make down     stop everything this Makefile started
#   make status   what is listening, and what is not
#   make logs     follow all three services at once
#   make gate     what CI runs — the whole thing, not a subset
#
# Ports and the database URL are overridable:
#   make up CORE_PORT=9080 DESK_PORT=9098

SHELL := /bin/bash

PG_CONTAINER ?= aios-pg
PG_PORT      ?= 55432
PG_USER      ?= aios
PG_PASSWORD  ?= aios
PG_DB        ?= aiosui
PG_TESTDB    ?= flowtest

CORE_PORT  ?= 8080
FLOWS_PORT ?= 8097
DESK_PORT  ?= 8098

DATA_DIR     ?= /tmp/aios-data
DATABASE_URL ?= postgresql://$(PG_USER):$(PG_PASSWORD)@localhost:$(PG_PORT)/$(PG_DB)
TEST_DB_URL  ?= postgresql://$(PG_USER):$(PG_PASSWORD)@localhost:$(PG_PORT)/$(PG_TESTDB)

RUN_DIR ?= .run
LOG_DIR ?= $(RUN_DIR)/logs

# The project whose source gets copied into its scope's sandbox, and the scope
# that receives it. Override both to provision a different project.
PROJECT      ?= projects/coclea-sr
PROJECT_NAME ?= coclea-sr
SCOPE        ?=

.PHONY: up down status logs gate postgres core flows desk wait clean-run sandbox-image provision

up: postgres core flows desk wait
	@echo ""
	@echo "  ai-os is up   ->  http://localhost:$(DESK_PORT)"
	@echo "  logs: make logs     stop: make down"

postgres:
	@mkdir -p $(LOG_DIR)
	@if [ -z "$$(docker ps -q -f name=^/$(PG_CONTAINER)$$)" ]; then \
	  if [ -n "$$(docker ps -aq -f name=^/$(PG_CONTAINER)$$)" ]; then \
	    echo "postgres: starting existing container $(PG_CONTAINER)"; \
	    docker start $(PG_CONTAINER) > /dev/null; \
	  else \
	    echo "postgres: creating $(PG_CONTAINER) on $(PG_PORT)"; \
	    docker run -d --name $(PG_CONTAINER) \
	      -e POSTGRES_USER=$(PG_USER) -e POSTGRES_PASSWORD=$(PG_PASSWORD) \
	      -e POSTGRES_DB=$(PG_DB) -p $(PG_PORT):5432 postgres:16 > /dev/null; \
	  fi; \
	else echo "postgres: already running"; fi
	@for i in $$(seq 1 30); do \
	  docker exec $(PG_CONTAINER) pg_isready -U $(PG_USER) -q 2>/dev/null && break; sleep 1; \
	done
	@docker exec $(PG_CONTAINER) psql -U $(PG_USER) -d $(PG_DB) -tAc \
	  "SELECT 1 FROM pg_database WHERE datname='$(PG_TESTDB)'" 2>/dev/null | grep -q 1 \
	  || docker exec $(PG_CONTAINER) createdb -U $(PG_USER) $(PG_TESTDB) 2>/dev/null || true

# Each service is started only if its port is free. Re-running `make up` on a
# live stack is then a no-op rather than three processes fighting over a port
# and one of them dying with EADDRINUSE into a log nobody is reading.
START := ./scripts/start-service.sh

core: postgres
	@DATA_DIR=$(DATA_DIR) DATABASE_URL=$(DATABASE_URL) SESSION_STORE=postgres PORT=$(CORE_PORT) \
	  $(START) core $(CORE_PORT) ai-base $(PWD)/$(LOG_DIR)/core.log $(PWD)/$(RUN_DIR)/core.pid \
	  -- node --env-file=.env src/index.ts

flows: core
	@DATA_DIR=$(DATA_DIR) DATABASE_URL=$(DATABASE_URL) SESSION_STORE=postgres \
	  FLOWS_ALLOW_UNAUTHENTICATED=1 PORT=$(FLOWS_PORT) CORE_API_URL=http://localhost:$(CORE_PORT) \
	  GATE_REPORTS_DIR=$(PWD)/$(PROJECT)/gates/reports \
	  $(START) flows $(FLOWS_PORT) ai-flows $(PWD)/$(LOG_DIR)/flows.log $(PWD)/$(RUN_DIR)/flows.pid \
	  -- node --env-file=../ai-base/.env scripts/serve.ts

desk: flows
	@DATABASE_URL=$(DATABASE_URL) FLOWS_API_URL=http://localhost:$(FLOWS_PORT) DESK_PORT=$(DESK_PORT) \
	  LOCAL_SANDBOX_IMAGE=$${LOCAL_SANDBOX_IMAGE:-} \
	  $(START) desk $(DESK_PORT) ai-ui $(PWD)/$(LOG_DIR)/desk.log $(PWD)/$(RUN_DIR)/desk.pid \
	  -- node scripts/serve.ts

# Wait for the desk to actually answer, not for a process to exist.
#
# `nohup ... &` returns immediately and a service that dies on startup — a bad
# .env, a port taken, a migration that failed — leaves a PID file and no server.
# `make up` printing a URL that 500s is worse than `make up` failing.
wait:
	@printf "waiting for the desk"
	@for i in $$(seq 1 45); do \
	  if curl -fsS -o /dev/null http://localhost:$(DESK_PORT)/healthz 2>/dev/null \
	     || curl -fsS -o /dev/null http://localhost:$(DESK_PORT)/ 2>/dev/null; then \
	    echo " ok"; exit 0; fi; \
	  printf "."; sleep 1; \
	done; \
	echo ""; echo "the desk never answered on $(DESK_PORT). Last lines:"; \
	tail -n 15 $(LOG_DIR)/desk.log 2>/dev/null; \
	tail -n 15 $(LOG_DIR)/core.log 2>/dev/null; exit 1

# Stopped in reverse dependency order: the desk first, so it does not spend a
# poll cycle failing to reach a flows service that is already gone.
#
# Written as "name:port" pairs rather than a `case`, because Make collapses a
# recipe onto one line and bash then chokes on the `;;` — a syntax error in a
# target whose whole job is cleaning up.
down:
	@for pair in "desk:$(DESK_PORT)" "flows:$(FLOWS_PORT)" "core:$(CORE_PORT)"; do \
	  name=$${pair%%:*}; port=$${pair##*:}; \
	  pids=$$(lsof -ti:$$port 2>/dev/null); \
	  if [ -n "$$pids" ]; then echo "stopping $$name ($$port)"; kill $$pids 2>/dev/null || true; fi; \
	done
	@rm -f $(RUN_DIR)/*.pid
	@echo "postgres left running — 'docker stop $(PG_CONTAINER)' if you want it down too"

status:
	@for pair in "core:$(CORE_PORT)" "flows:$(FLOWS_PORT)" "desk:$(DESK_PORT)"; do \
	  name=$${pair%%:*}; port=$${pair##*:}; \
	  if lsof -ti:$$port > /dev/null 2>&1; then echo "  $$name  up    :$$port"; \
	  else echo "  $$name  DOWN  :$$port"; fi; \
	done
	@if [ -n "$$(docker ps -q -f name=^/$(PG_CONTAINER)$$)" ]; then \
	  echo "  pg    up    :$(PG_PORT)"; else echo "  pg    DOWN  :$(PG_PORT)"; fi

logs:
	@tail -f $(LOG_DIR)/core.log $(LOG_DIR)/flows.log $(LOG_DIR)/desk.log

# The image the project's agents run in: the upstream sandbox plus a numeric
# stack. DOCKER_BUILDKIT=0 because buildkit resolves the FROM against a registry
# even when the base is already local, and fails on an image sitting right there.
sandbox-image:
	DOCKER_BUILDKIT=0 docker build -t coclea-sandbox:latest $(PROJECT)/sandbox

# Copy the project's source into a scope's sandbox so its agents can RUN it,
# not just read numbers somebody handed them.
#
#   make provision SCOPE=group:cochlea-lab-<id>
provision:
	@test -n "$(SCOPE)" || { echo "usage: make provision SCOPE=group:..."; exit 2; }
	cd ai-flows && DATA_DIR=$(DATA_DIR) DATABASE_URL=$(DATABASE_URL) SESSION_STORE=postgres \
	  node --env-file=../ai-base/.env scripts/provision-project.ts \
	  --scope "$(SCOPE)" --from ../$(PROJECT) --as $(PROJECT_NAME)

# The whole gate, which is what CI runs — not a subset of it.
gate:
	cd ai-ui    && npm run typecheck && npm test
	cd ai-flows && npm run typecheck && npm run typecheck:scripts \
	            && DATABASE_URL="$(TEST_DB_URL)" npm test
	cd ai-base  && npm run format:check && npm run lint && npm run lint:knip
	DATABASE_URL="$(TEST_DB_URL)" ./scripts/check-test-count.sh

clean-run:
	rm -rf $(RUN_DIR)
