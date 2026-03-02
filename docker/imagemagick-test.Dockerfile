FROM ubuntu:24.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends imagemagick && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /input /output

WORKDIR /workspace
