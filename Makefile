.PHONY: help setup dev build test clean spec-validate spec-status spec-view

# Default target
help:
	@echo "🎮 FLL Robot Simulator (WebGL/Wasm) - Build & Spec Manager"
	@echo ""
	@echo "Available commands:"
	@echo "  make setup          Install tools via mise and project dependencies"
	@echo "  make dev            Start local development server"
	@echo "  make build          Build production bundle (WebGL/Wasm)"
	@echo "  make test           Run test suites (parser, kinematics, SPIKE VM)"
	@echo "  make clean          Remove build artifacts"
	@echo "  make spec-status    Check OpenSpec artifact completion status"
	@echo "  make spec-validate  Validate OpenSpec specifications"
	@echo "  make spec-view      Open OpenSpec dashboard"
	@echo ""

setup:
	mise install
	@if [ -f package.json ]; then npm install; fi

dev:
	npm run dev

build:
	npm run build

test:
	npm run test

spec-status:
	openspec status --all

spec-validate:
	openspec validate --all

spec-view:
	openspec view

clean:
	rm -rf dist build .cache coverage
