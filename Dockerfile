FROM node:buster-slim AS builder

RUN apt-get update && apt-get -y install git python3
# Switch to official images once my PR is merged
RUN git clone https://github.com/AaronDewes/LndHub.git -b update-dependencies /lndhub

WORKDIR /lndhub

RUN npm i

# Delete git data as it's not needed inside the container

RUN rm -rf .git

FROM node:buster-slim

RUN adduser --disabled-password --uid 1000 --home /lndhub --gecos "" lndhub
COPY  --from=builder /lndhub /lndhub

RUN mkdir /lndhub/logs && chown -R lndhun:lndhub /lndhub

USER lndhub

ENV PORT=3000
EXPOSE 3000

CMD cp $LND_CERT_FILE /lndhub/ && cp $LND_ADMIN_MACAROON_FILE /lndhub/ && cd /lndhub && npm start
