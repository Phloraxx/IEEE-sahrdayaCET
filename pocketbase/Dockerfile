# syntax=docker/dockerfile:1.7
FROM alpine:3.22
ARG PB_VERSION=0.39.9
ARG TARGETARCH
ARG PB_SHA256_AMD64=4c5a1aced62ebf658bfbcfeaa944c4bfa88b173dd9d598d3cab55ea63587b36b
ARG PB_SHA256_ARM64=fd4138f29182288cbe6e9982e9f29b11df5f8e689c4f6a8f6cdf7aadd29d95a1
RUN apk add --no-cache ca-certificates curl unzip \
    && DETECTED_ARCH="${TARGETARCH:-$(apk --print-arch)}" \
    && case "$DETECTED_ARCH" in \
         amd64|x86_64) PB_ARCH=amd64; EXPECTED="$PB_SHA256_AMD64" ;; \
         arm64|aarch64) PB_ARCH=arm64; EXPECTED="$PB_SHA256_ARM64" ;; \
         *) echo "Unsupported architecture: $DETECTED_ARCH" >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -o /tmp/pocketbase.zip \
    && echo "$EXPECTED  /tmp/pocketbase.zip" | sha256sum -c - \
    && mkdir -p /pb \
    && unzip /tmp/pocketbase.zip -d /pb \
    && rm /tmp/pocketbase.zip
WORKDIR /pb
COPY pb_hooks ./pb_hooks
COPY pb_migrations ./pb_migrations
EXPOSE 8090
CMD ["./pocketbase", "serve", "--http=0.0.0.0:8090", "--encryptionEnv=PB_ENCRYPTION_KEY"]
