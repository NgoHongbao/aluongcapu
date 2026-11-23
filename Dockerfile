FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py private_media.py google_login.py storage.py couple.py database_tools.py ./
COPY site ./site
RUN mkdir -p /app/data && chmod 700 /app/data
ENV DATA_DIR=/app/data
EXPOSE 8000
CMD ["uvicorn","server:app","--host","0.0.0.0","--port","8000"]
