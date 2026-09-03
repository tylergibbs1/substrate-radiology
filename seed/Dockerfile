FROM python:3.12-slim

WORKDIR /app
COPY seed/requirements.txt seed/manifest.json seed/load.py ./
RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "load.py"]
