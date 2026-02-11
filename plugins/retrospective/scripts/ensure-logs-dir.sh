#!/bin/bash
# Ensure .logs directories exist for telemetry capture
# Called on SessionStart hook

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

mkdir -p "$PROJECT_DIR/.logs/prompts"
mkdir -p "$PROJECT_DIR/.logs/tools"
mkdir -p "$PROJECT_DIR/.logs/decisions"
mkdir -p "$PROJECT_DIR/.logs/feedback"
mkdir -p "$PROJECT_DIR/.logs/retrospectives"
