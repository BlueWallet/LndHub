FROM debian:bullseye-slim

RUN apt-get update && apt-get -y --no-install-recommends install npm=* nodejs=* \
     build-essential=* \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY . /lndhub
WORKDIR /lndhub
RUN npm i && npm run build
