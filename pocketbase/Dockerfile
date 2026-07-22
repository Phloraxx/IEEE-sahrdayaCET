# syntax=docker/dockerfile:1.7
FROM alpine:3.22
ARG PB_VERSION=0.39.8
ARG TARGETARCH
ARG PB_SHA256_AMD64=3b675575ff0e6dcc5befc85a9644aea6b04ac617ce125ecb2b6989a3c5b5664f
ARG PB_SHA256_ARM64=d9e44e40f2483b468bb4dd64e12b554aa85941dc5ee9c4bb87aee8fa9e469425
RUN apk add --no-cache ca-certificates curl unzip sqlite \
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
COPY pocketbase/import-prod-snapshot.sh ./import-prod-snapshot.sh
RUN chmod +x ./import-prod-snapshot.sh
EXPOSE 8090
CMD ["./pocketbase", "serve", "--http=0.0.0.0:8090", "--encryptionEnv=PB_ENCRYPTION_KEY"]
