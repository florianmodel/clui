FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ripgrep && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["rg"]
