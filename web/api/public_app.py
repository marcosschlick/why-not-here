from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from web.api.database import initialize_database
from web.api.participation import public_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None, lifespan=lifespan)


@app.middleware("http")
async def protect_same_origin(request, call_next):
    origin = request.headers.get("origin")
    if origin:
        try:
            parsed = urlsplit(origin)
        except ValueError:
            return JSONResponse(
                status_code=403,
                content={"detail": "Cross-origin requests are not allowed"},
            )
        if (
            parsed.scheme not in {"http", "https"}
            or parsed.netloc.lower() != request.headers.get("host", "").lower()
        ):
            return JSONResponse(
                status_code=403,
                content={"detail": "Cross-origin requests are not allowed"},
            )
    if request.headers.get("sec-fetch-site") == "cross-site":
        return JSONResponse(
            status_code=403, content={"detail": "Cross-origin requests are not allowed"}
        )
    return await call_next(request)


app.include_router(public_router)
