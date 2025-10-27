PROJECT_NAME ?= workflow-engine
DOCKER_COMPOSE ?= docker compose
BUN ?= bun

.PHONY: install dev test lint build docker-build up down logs clean migrate db-shell

install:
	$(BUN) install

dev:
	$(BUN) run --hot src/index.ts

test:
	$(BUN) test

lint:
	$(BUN) run lint

build:
	$(BUN) run build

docker-build:
	docker build -t $(PROJECT_NAME) .

up:
	$(DOCKER_COMPOSE) up -d

down:
	$(DOCKER_COMPOSE) down

logs:
	$(DOCKER_COMPOSE) logs -f app

clean:
	$(DOCKER_COMPOSE) down -v --remove-orphans

migrate:
	$(BUN) run src/sql/migrate.ts

db-shell:
	$(DOCKER_COMPOSE) exec db psql -U bun -d workflows
