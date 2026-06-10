# doc-convert service

A small **LibreOffice-headless** service that turns office/rich documents into PDF
so they can run through the importer's PDF reconstruction pipeline. Sibling to the
`page-render` service — LibreOffice can't run in a Supabase edge function.

Handles: `doc/docx/odt/rtf/dot/wpd/fodt`, `ppt/pptx/odp/pps/fodp`, `xls/xlsx/ods/xlsm/fods`,
`txt/csv/tsv/md`, `html/htm/xhtml`, `epub`.

## API
- `GET /health` → `{ ok: true }`
- `POST /convert` (header `x-convert-key: $DOC_CONVERT_KEY`)
  - body: `{ "filename": "deck.pptx", "dataBase64": "…" }`
  - 200: `{ "dataBase64": "…", "contentType": "application/pdf" }`
  - 4xx: `{ "error": "…" }`

## Security
- Shared-secret auth (`x-convert-key`).
- The uploaded **filename is never used in a filesystem path** — only a validated short
  extension is carried onto a random temp name (`src/lib.mjs`, unit-tested in `src/lib.test.mjs`).
- `soffice` is spawned with an **argv array** (no shell); per-request temp dir + LibreOffice
  user profile; conversion timeout; request-body cap. Headless convert does not run document macros.

> Run with limited concurrency (LibreOffice is heavy and not fully re-entrant) — scale horizontally
> behind the queue rather than many conversions per instance. Keep it on a private network.

## Run
```bash
# needs LibreOffice on PATH (apt-get install libreoffice-core libreoffice-writer …)
DOC_CONVERT_KEY=$(openssl rand -hex 24) npm start   # :8080
npm test                                            # pure helper tests
```

## Docker
```bash
docker build -t doc-convert services/doc-convert
docker run -p 8080:8080 -e DOC_CONVERT_KEY=secret doc-convert
```

## Wire it to the importer
Set on the `convert-to-pdf` edge function (Supabase secrets):
```
DOC_CONVERT_URL = https://<your-deployed-host>
DOC_CONVERT_KEY = <same secret as the service>
```
Without them, office/document uploads fall back to "export to PDF" guidance.
