# WeasyPrint microservice for premium investment-report PDFs.
# Targets Google Cloud Run (or any container host: Fly.io, Railway, Render).
#
# Build & deploy (Cloud Run example):
#   gcloud builds submit --tag gcr.io/PROJECT_ID/weasyprint-service .
#   gcloud run deploy weasyprint-service \
#     --image gcr.io/PROJECT_ID/weasyprint-service \
#     --region australia-southeast1 \
#     --memory 2Gi --cpu 2 --concurrency 4 --timeout 600 \
#     --set-env-vars WEASYPRINT_SERVICE_TOKEN=<long-random-string>

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

# WeasyPrint native deps + a broad font stack for editorial typography.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      libpango-1.0-0 libpangoft2-1.0-0 \
      libcairo2 libgdk-pixbuf-2.0-0 \
      libffi-dev shared-mime-info \
      fontconfig \
      fonts-dejavu fonts-liberation fonts-noto fonts-noto-cjk \
      fonts-inter fonts-roboto fonts-lato \
      curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Premium editorial typography — self-host so PDFs don't depend on the network.
# Variable .ttf files pulled from the official Google Fonts repo.
RUN mkdir -p /usr/share/fonts/truetype/premium && \
    cd /usr/share/fonts/truetype/premium && \
    BASE="https://github.com/google/fonts/raw/main/ofl" && \
    curl -fsSL -o "PlayfairDisplay-VF.ttf"          "$BASE/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf" && \
    curl -fsSL -o "PlayfairDisplay-Italic-VF.ttf"   "$BASE/playfairdisplay/PlayfairDisplay-Italic%5Bwght%5D.ttf" && \
    curl -fsSL -o "Inter-VF.ttf"                    "$BASE/inter/Inter%5Bopsz%2Cwght%5D.ttf" && \
    curl -fsSL -o "Inter-Italic-VF.ttf"             "$BASE/inter/Inter-Italic%5Bopsz%2Cwght%5D.ttf" && \
    curl -fsSL -o "Fraunces-VF.ttf"                 "$BASE/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf" && \
    curl -fsSL -o "Fraunces-Italic-VF.ttf"          "$BASE/fraunces/Fraunces-Italic%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf" && \
    curl -fsSL -o "CormorantGaramond-Regular.ttf"   "$BASE/cormorantgaramond/CormorantGaramond-Regular.ttf" && \
    curl -fsSL -o "CormorantGaramond-Italic.ttf"    "$BASE/cormorantgaramond/CormorantGaramond-Italic.ttf" && \
    curl -fsSL -o "CormorantGaramond-Medium.ttf"    "$BASE/cormorantgaramond/CormorantGaramond-Medium.ttf" && \
    curl -fsSL -o "CormorantGaramond-SemiBold.ttf"  "$BASE/cormorantgaramond/CormorantGaramond-SemiBold.ttf" && \
    curl -fsSL -o "CormorantGaramond-Bold.ttf"      "$BASE/cormorantgaramond/CormorantGaramond-Bold.ttf" && \
    fc-cache -fv && \
    fc-list | grep -iE "playfair|inter|fraunces|cormorant" | sort

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8080
CMD exec gunicorn --bind :$PORT --workers 2 --threads 4 --timeout 600 app:app
