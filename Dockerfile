# syntax=docker/dockerfile:1.7
# 依存パッケージゼロ。SQLiteもHTTPサーバーもNode本体の機能だけで動く。
FROM node:24-alpine

WORKDIR /app

COPY server/ ./server/
COPY content/ ./content/
COPY site/assets/ ./site/assets/

# 記事はイメージ内の content/ から毎起動DBへ同期する。
# 閲覧数・評価・クリック数はボリューム上のDBにだけ存在し、同期では消えない。
RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/news.db \
    CONTENT_DIR=/app/content

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz > /dev/null || exit 1

CMD ["node", "server/index.js"]
