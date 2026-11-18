#!/bin/sh
set -eu
if [ -n "${RENDER_EXTERNAL_URL:-}" ] && [ -z "${PUBLIC_ORIGIN:-}" ]; then
  export PUBLIC_ORIGIN="$RENDER_EXTERNAL_URL"
fi
python3 /app/deployment/cloud_init.py
exec node '/app/002-产品原型、前端代码/backend/src/server.js'
