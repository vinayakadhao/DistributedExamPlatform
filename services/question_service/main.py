import os
from contextlib import asynccontextmanager

import jwt
import psycopg
from psycopg.rows import dict_row
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field, model_validator

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


@asynccontextmanager
async def lifespan(app: FastAPI):
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS questions (
                id BIGSERIAL PRIMARY KEY,
                exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
                question_text TEXT NOT NULL,
                option_a TEXT NOT NULL,
                option_b TEXT NOT NULL,
                option_c TEXT NOT NULL,
                option_d TEXT NOT NULL,
                correct_option CHAR(1) NOT NULL
                    CHECK (correct_option IN ('A', 'B', 'C', 'D')),
                marks NUMERIC(8,2) NOT NULL CHECK (marks > 0),
                explanation TEXT NOT NULL DEFAULT '',
                created_by BIGINT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
    yield


app = FastAPI(title="Exam Platform Question Service", lifespan=lifespan)


class QuestionCreate(BaseModel):
    exam_id: int = Field(gt=0)
    question_text: str = Field(min_length=5, max_length=5000)
    option_a: str = Field(min_length=1, max_length=1000)
    option_b: str = Field(min_length=1, max_length=1000)
    option_c: str = Field(min_length=1, max_length=1000)
    option_d: str = Field(min_length=1, max_length=1000)
    correct_option: str
    marks: float = Field(gt=0, le=10000)
    explanation: str = Field(default="", max_length=5000)

    @model_validator(mode="after")
    def validate_correct_option(self):
        self.correct_option = self.correct_option.strip().upper()
        if self.correct_option not in ("A", "B", "C", "D"):
            raise ValueError("correct_option must be A, B, C, or D")
        return self


def authenticated_user(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Bearer token required")
    try:
        return jwt.decode(
            authorization[7:],
            JWT_SECRET,
            algorithms=["HS256"],
        )
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid or expired token")


@app.get("/health")
def health():
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1")
        return {"service": "question", "status": "healthy"}
    except Exception:
        raise HTTPException(503, "Database unavailable")


@app.post("/questions", status_code=201)
def create_question(
    body: QuestionCreate,
    authorization: str | None = Header(default=None),
):
    user = authenticated_user(authorization)
    if user.get("role") != "teacher":
        raise HTTPException(403, "Only teachers can create questions")

    with get_connection() as conn:
        exam = conn.execute(
            "SELECT id, total_marks FROM exams WHERE id = %s",
            (body.exam_id,),
        ).fetchone()

        if not exam:
            raise HTTPException(404, "Exam not found")

        question = conn.execute(
            """
            INSERT INTO questions (
                exam_id, question_text, option_a, option_b,
                option_c, option_d, correct_option, marks,
                explanation, created_by
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                body.exam_id, body.question_text, body.option_a,
                body.option_b, body.option_c, body.option_d,
                body.correct_option, body.marks, body.explanation,
                int(user["sub"]),
            ),
        ).fetchone()

    return question


@app.get("/exams/{exam_id}/questions")
def list_questions(
    exam_id: int,
    authorization: str | None = Header(default=None),
):
    user = authenticated_user(authorization)

    with get_connection() as conn:
        exam = conn.execute(
            "SELECT id FROM exams WHERE id = %s",
            (exam_id,),
        ).fetchone()

        if not exam:
            raise HTTPException(404, "Exam not found")

        if user.get("role") == "teacher":
            questions = conn.execute(
                """
                SELECT * FROM questions
                WHERE exam_id = %s
                ORDER BY id
                """,
                (exam_id,),
            ).fetchall()
        else:
            # Students must never receive correct answers or explanations
            # before evaluation/release.
            questions = conn.execute(
                """
                SELECT id, exam_id, question_text, option_a,
                       option_b, option_c, option_d, marks
                FROM questions
                WHERE exam_id = %s
                ORDER BY id
                """,
                (exam_id,),
            ).fetchall()

    return {"count": len(questions), "questions": questions}

