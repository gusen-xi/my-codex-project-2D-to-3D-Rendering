FROM node:22-bookworm-slim AS frontend
WORKDIR /build
RUN npm install --global pnpm@10
COPY ["002-产品原型、前端代码/fronted/package.json", "002-产品原型、前端代码/fronted/pnpm-lock.yaml", "./"]
RUN pnpm install --frozen-lockfile
COPY ["002-产品原型、前端代码/fronted/", "./"]
COPY deployment/prepare-assets.mjs /build/prepare-assets.mjs
RUN node prepare-assets.mjs /build/public && pnpm build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/python && npm install --global pnpm@10
ENV PATH="/opt/python/bin:${PATH}" HOST=0.0.0.0 PORT=10000 DEMO_MODE=1 CLOUD_FILES=1 DB_SSL=1 PYTHON_COMMAND=/opt/python/bin/python3 IMAGE_STYLE_SERVICE=/app/deployment/model IMAGE_STYLE_PYTHON=/opt/python/bin/python3
WORKDIR /app
COPY ["002-产品原型、前端代码/fronted/requirements.txt", "/app/requirements.txt"]
RUN pip install --no-cache-dir -r requirements.txt
COPY ["002-产品原型、前端代码/backend/", "./002-产品原型、前端代码/backend/"]
RUN cd '002-产品原型、前端代码/backend' && pnpm install --prod --frozen-lockfile
COPY ["002-产品原型、前端代码/fronted/server/", "./002-产品原型、前端代码/fronted/server/"]
COPY --from=frontend /build/dist ./002-产品原型、前端代码/fronted/dist
COPY --from=frontend /build/public ./002-产品原型、前端代码/fronted/public
COPY ["003-数据库脚本/001_create_tables.sql", "003-数据库脚本/002_create_auth_sessions.sql", "./003-数据库脚本/"]
COPY deployment ./deployment
EXPOSE 10000
CMD ["sh", "/app/deployment/start.sh"]
