# Gale developer commands. Run `make help` for the list.
.DEFAULT_GOAL := help
SHELL := bash

BACKEND := backend
FRONTEND := frontend

.PHONY: help install dev dev-api dev-web test lint fmt build requirements docker docker-down check-docker

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install backend (uv) and frontend (npm) dependencies
	cd $(BACKEND) && uv sync
	cd $(FRONTEND) && npm ci

dev: ## Run API (:8000, reload) and web (:5173, proxied) together; Ctrl-C stops both
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) --no-print-directory dev-api & \
	$(MAKE) --no-print-directory dev-web & \
	wait

dev-api: ## Run the API with auto-reload on :8000
	cd $(BACKEND) && uv run uvicorn gale.main:app --reload --port 8000

dev-web: ## Run the Vite dev server on :5173 (proxies /api to :8000)
	cd $(FRONTEND) && npm run dev

test: ## Backend and frontend unit tests
	cd $(BACKEND) && uv run pytest
	cd $(FRONTEND) && npm test

lint: ## Ruff, mypy, ESLint and tsc
	cd $(BACKEND) && uv run ruff check && uv run ruff format --check && uv run mypy src tests
	cd $(FRONTEND) && npm run lint && npx tsc --noEmit

fmt: ## Auto-format backend code
	cd $(BACKEND) && uv run ruff check --fix && uv run ruff format

build: ## Production build of the frontend
	cd $(FRONTEND) && npm run build

requirements: ## Re-export requirements.txt (used by Vercel) from uv.lock
	cd $(BACKEND) && uv export --no-dev --no-hashes --no-emit-project --format requirements.txt -o ../requirements.txt

docker: ## Build and run the production image on :8000
	docker compose up --build

docker-down: ## Stop the compose stack
	docker compose down

check-docker: ## Backend lint + tests inside python:3.12 (for hosts where ruff's binary cannot run, e.g. NixOS)
	docker run --rm -v "$(CURDIR)/$(BACKEND)":/src:ro -w /work ghcr.io/astral-sh/uv:0.11.16-python3.12-trixie-slim \
	  sh -c 'cp -r /src/. /work && rm -rf .venv && uv sync --frozen && uv run ruff check && uv run ruff format --check && uv run mypy src tests && uv run pytest'
