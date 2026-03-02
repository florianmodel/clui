FROM python:3.12-slim
RUN pip install --no-cache-dir yt-dlp
ENTRYPOINT ["yt-dlp"]
