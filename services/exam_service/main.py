import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import jwt
import psycopg
from psycopg.rows import dict_row
from fastapi import FastAPI, HTTPException, Header, Query
from pydantic import BaseModel, Field, model_validator

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


@asynccontextmanager
async def lifespan(app: FastAPI):
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS exams (
                id BIGSERIAL PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 600),
                total_marks NUMERIC(8,2) NOT NULL CHECK (total_marks > 0),
                negative_marking NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (negative_marking >= 0),
                starts_at TIMESTAMPTZ NOT NULL,
                ends_at TIMESTAMPTZ NOT NULL,
                created_by BIGINT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CHECK (ends_at > starts_at)
            )
        """)
    yield


app = FastAPI(title="Exam Platform Exam Service", lifespan=lifespan)


class ExamCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=5000)
    duration_minutes: int = Field(ge=1, le=600)
    total_marks: float = Field(gt=0, le=100000)
    negative_marking: float = Field(default=0, ge=0, le=100)
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("starts_at and ends_at must include a timezone")
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be later than starts_at")
        return self


def authenticated_user(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Bearer token required")
    token = authorization[7:]
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid or expired token")


@app.get("/health")
def health():
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1")
        return {"service": "exam", "status": "healthy"}
    except Exception:
        raise HTTPException(503, "Database unavailable")


@app.post("/exams", status_code=201)
def create_exam(body: ExamCreate, authorization: str | None = Header(default=None)):
    user = authenticated_user(authorization)
    if user.get("role") != "teacher":
        raise HTTPException(403, "Only teachers can create exams")

    with get_connection() as conn:
        exam = conn.execute(
            """
            INSERT INTO exams
                (title, description, duration_minutes, total_marks,
                 negative_marking, starts_at, ends_at, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                body.title, body.description, body.duration_minutes,
                body.total_marks, body.negative_marking,
                body.starts_at, body.ends_at, int(user["sub"]),
            ),
        ).fetchone()
    return exam


@app.get("/exams")
def list_exams(
    available_only: bool = Query(default=False),
    authorization: str | None = Header(default=None),
):
    user = authenticated_user(authorization)
    with get_connection() as conn:
        if available_only and user.get("role") == "student":
            exams = conn.execute(
                """
                SELECT * FROM exams
                WHERE starts_at <= NOW() AND ends_at > NOW()
                ORDER BY starts_at
                """
            ).fetchall()
        else:
            exams = conn.execute(
                "SELECT * FROM exams ORDER BY created_at DESC"
            ).fetchall()
    return {"count": len(exams), "exams": exams}


@app.get("/exams/{exam_id}")
def get_exam(exam_id: int, authorization: str | None = Header(default=None)):
    authenticated_user(authorization)
    with get_connection() as conn:
        exam = conn.execute(
            "SELECT * FROM exams WHERE id = %s", (exam_id,)
        ).fetchone()
    if not exam:
        raise HTTPException(404, "Exam not found")
    return exam
