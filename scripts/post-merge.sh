#!/bin/bash
# Runs automatically after task merges. Must be idempotent and non-interactive.
set -e

npm install --no-audit --no-fund
