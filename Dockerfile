FROM alpine:latest AS perms

# This is a bit weird, but required to make sure the LND data can be accessed. 
RUN adduser --disabled-password \
            --home "/lndhub" \
            --gecos "" \
            "lndhub"

FROM node:buster-slim AS builder

# These packages are required for building LNDHub
RUN apt-get update && apt-get -y install git python3

# TODO: Switch to official images once my PR is merged
RUN git clone https://github.com/AaronDewes/LndHub.git -b update-dependencies /lndhub

WORKDIR /lndhub

RUN npm i

FROM node:buster-slim

# Create a specific user so LNDHub doesn't run as root
COPY  --from=perms /etc/group /etc/passwd /etc/shadow  /etc/

# Copy LNDHub with installed modules from builder
COPY  --from=builder /lndhub /lndhub

# Delete git data as it's not needed inside the container
RUN rm -rf .git

# Create logs folder and ensure permissions are set correctly
RUN mkdir /lndhub/logs && chown -R lndhub:lndhub /lndhub

USER lndhub

ENV PORT=3000
EXPOSE 3000

CMD cp $LND_CERT_FILE /lndhub/ && cp $LND_ADMIN_MACAROON_FILE /lndhub/ && cd /lndhub && npm start
