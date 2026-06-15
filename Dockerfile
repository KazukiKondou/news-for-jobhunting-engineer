# syntax=docker/dockerfile:1.7
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/

# Generate days.json manifest from the YYYY-MM-DD page directories (ascending).
# This is the single source of truth for /assets/day-nav.js runtime self-healing,
# so it is built fresh here rather than committed.
RUN cd /usr/share/nginx/html && { \
      printf '['; first=1; \
      for d in $(ls -d 20[0-9][0-9]-[0-1][0-9]-[0-3][0-9] 2>/dev/null | sort); do \
        [ -f "$d/index.html" ] || continue; \
        if [ "$first" = 1 ]; then first=0; else printf ','; fi; \
        printf '"%s"' "$d"; \
      done; printf ']'; \
    } > days.json

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
