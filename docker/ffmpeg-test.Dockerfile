FROM ubuntu:24.04

# Install ffmpeg and clean up apt cache in one layer
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Input files are mounted at /input (read-only)
# Output files go to /output (read-write)
# Both dirs are created by DockerManager before container start
