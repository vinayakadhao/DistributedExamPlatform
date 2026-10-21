import os
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"

SERVICE_URLS = {
    "auth": os.getenv("AUTH_SERVICE_URL", "http://auth_service:8001"),
    "exams": os.getenv("EXAM_SERVICE_URL", "http://exam_service:8002"),
    "questions": os.getenv("QUESTION_SERVICE_URL", "http://question_service:8003"),
    "attempts": os.getenv("ATTEMPT_SERVICE_URL", "http://attempt_service:8004"),
}

API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

app = FastAPI(
    title="Distributed Online Examination Platform",
    description="Web frontend and API gateway for the examination platform",
    version="0.2.0",
)

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def root():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/health")
def health():
    return {"service": "gateway", "status": "healthy"}


def get_upstream_path(service: str, path: str) -> str:
    if service == "auth":
        return f"/{path}" if path else "/"

    if service == "exams":
        return f"/exams/{path}" if path else "/exams"

    if service == "questions":
        if path.startswith("exams/"):
            return f"/{path}"
        return f"/questions/{path}" if path else "/questions"

    if service == "attempts":
        return f"/attempts/{path}" if path else "/attempts"

    raise HTTPException(status_code=404, detail="Unknown API service")


@app.api_route("/api/{service}", methods=API_METHODS)
@app.api_route("/api/{service}/{path:path}", methods=API_METHODS)
async def proxy_api(request: Request, service: str, path: str = ""):
    if service not in SERVICE_URLS:
        raise HTTPException(status_code=404, detail="Unknown API service")

    base_url = SERVICE_URLS[service].rstrip("/")
    upstream_path = get_upstream_path(service, path)
    target_url = f"{base_url}{upstream_path}"

    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    excluded_request_headers = {
        "host",
        "content-length",
        "connection",
        "transfer-encoding",
        "accept-encoding",
    }

    request_headers = {
        name: value
        for name, value in request.headers.items()
        if name.lower() not in excluded_request_headers
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=5.0)
        ) as client:
            upstream = await client.request(
                method=request.method,
                url=target_url,
                headers=request_headers,
                content=await request.body(),
            )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"The {service} service timed out",
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail=f"The {service} service is unavailable",
        )

    allowed_response_headers = {
        "content-type",
        "cache-control",
        "location",
        "www-authenticate",
    }

    response_headers = {
        name: value
        for name, value in upstream.headers.items()
        if name.lower() in allowed_response_headers
    }

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
    )
