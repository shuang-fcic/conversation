# Build docker-compose.prod.yml first so this local base tag exists.
FROM ms-conversations-backend:prod AS cron

# Pinned and checksum-verified container-native scheduler.
ENV SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v0.2.47/supercronic-linux-amd64 \
    SUPERCRONIC_SHA1SUM=712d2ece75da6f6e530192a151488578153e4e96 \
    SUPERCRONIC=supercronic-linux-amd64

USER root
RUN curl -fsSLO "$SUPERCRONIC_URL" \
 && echo "${SUPERCRONIC_SHA1SUM}  ${SUPERCRONIC}" | sha1sum -c - \
 && chmod +x "$SUPERCRONIC" \
 && mv "$SUPERCRONIC" "/usr/local/bin/${SUPERCRONIC}" \
 && ln -s "/usr/local/bin/${SUPERCRONIC}" /usr/local/bin/supercronic

# Supercronic accepts one file; echo prevents adjacent fragments from merging.
COPY crontab.d/ /app/crontab.d/
RUN for f in /app/crontab.d/*.crontab; do cat "$f"; echo; done > /app/crontab
USER node

CMD ["supercronic", "/app/crontab"]
