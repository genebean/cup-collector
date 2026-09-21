FROM alpine:3.24 AS downloader

ARG PB_VERSION=0.39.11
ARG PB_ARCH=amd64

RUN apk add --no-cache ca-certificates curl unzip

WORKDIR /tmp/pocketbase
RUN set -eux; \
    archive="pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip"; \
    base_url="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"; \
    curl -fsSLO "${base_url}/${archive}"; \
    curl -fsSLO "${base_url}/checksums.txt"; \
    grep "  ${archive}$" checksums.txt | sha256sum -c -; \
    unzip "${archive}"; \
    install -m 0755 pocketbase /usr/local/bin/pocketbase

FROM alpine:3.24

RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates tzdata

COPY --from=downloader /usr/local/bin/pocketbase /usr/local/bin/pocketbase

WORKDIR /pb
EXPOSE 8090
ENTRYPOINT ["/usr/local/bin/pocketbase"]
