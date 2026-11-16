FROM clamav/clamav@sha256:7054e3f34308c384ea43cd786ea17abf899bd44af40af9f1b099853d7a5c214e
COPY ops/clamav/clamd.conf /etc/clamav/clamd.conf
COPY ops/clamav/entrypoint.sh /usr/local/bin/anibish-scanner-entrypoint
COPY ops/clamav/healthcheck.sh /usr/local/bin/anibish-scanner-health
RUN test -x /init && command -v nc && command -v date && command -v sha256sum \
 && clamd --version | grep -q '^ClamAV 1.5.4' \
 && sha256sum /etc/clamav/clamd.conf > /etc/clamav/anibish-profile.sha256 \
 && chmod 0755 /usr/local/bin/anibish-scanner-entrypoint /usr/local/bin/anibish-scanner-health
ENTRYPOINT ["/usr/local/bin/anibish-scanner-entrypoint"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=6 CMD ["/usr/local/bin/anibish-scanner-health"]
