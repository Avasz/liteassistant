#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8100 --reload
