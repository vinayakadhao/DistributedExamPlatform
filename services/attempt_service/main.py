import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import jwt
import pika
import psycopg
from psycopg.rows import dict_row
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
RABBITMQ_USER = os.environ["RABBITMQ_USER"]
RABBITMQ_PASSWORD = os.environ["RABBITMQ_PASSWORD"]
SUBMISSION_QUEUE = "exam_submissions"


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


@asynccontextmanager
async def lifespan(app: FastAPI):
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS exam_attempts (
                id UUID PRIMARY KEY,
                exam_id BIGINT NOT NULL REFERENCES exams(id),
                student_id BIGINT NOT NULL,
                started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL,
                submitted_at TIMESTAMPTZ,
                status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'submitted', 'evaluated')),
                score NUMERIC(10,2),
                evaluation_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (evaluation_status IN ('pending', 'queued', 'completed', 'failed')),
                UNIQUE (exam_id, student_id, id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS attempt_answers (
                attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
                question_id BIGINT NOT NULL REFERENCES questions(id),
                selected_option CHAR(1)
                    CHECK (selected_option IN ('A', 'B', 'C', 'D') OR selected_option IS NULL),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (attempt_id, question_id)
            )
        """)
    yield


app = FastAPI(
    title="Exam Platform Attempt Service",
    lifespan=lifespan,
)


class AnswerRequest(BaseModel):
    question_id: int = Field(gt=0)
    selected_option: str | None


def authenticated_user(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Bearer token required")
    try:
        payload = jwt.decode(
            authorization[7:],
            JWT_SECRET,
            algorithms=["HS256"],
        )
        if payload.get("role") not in ("teacher", "student"):
            raise HTTPException(403, "Invalid account role")
        return payload
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid or expired token")


def require_student(authorization: str | None):
    user = authenticated_user(authorization)
    if user.get("role") != "student":
        raise HTTPException(403, "Only students can perform this action")
    return user


def publish_submission(event):
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        credentials=credentials,
        heartbeat=30,
        blocked_connection_timeout=10,
    )
    connection = pika.BlockingConnection(parameters)
    try:
        channel = connection.channel()
        channel.queue_declare(queue=SUBMISSION_QUEUE, durable=True)
        channel.basic_publish(
            exchange="",
            routing_key=SUBMISSION_QUEUE,
            body=json.dumps(event),
            properties=pika.BasicProperties(
                delivery_mode=2,
                content_type="application/json",
                message_id=event["event_id"],
            ),
        )
    finally:
        connection.close()


@app.get("/health")
def health():
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1")
        return {"service": "attempt", "status": "healthy"}
    except Exception:
        raise HTTPException(503, "Database unavailable")


@app.post("/attempts/{exam_id}/start", status_code=201)
def start_attempt(
    exam_id: int,
    authorization: str | None = Header(default=None),
):
    user = require_student(authorization)
    student_id = int(user["sub"])
    now = datetime.now(timezone.utc)

    with get_connection() as conn:
        exam = conn.execute(
            """
            SELECT id, duration_minutes, starts_at, ends_at
            FROM exams WHERE id = %s
            """,
            (exam_id,),
        ).fetchone()

        if not exam:
            raise HTTPException(404, "Exam not found")

        if now < exam["starts_at"] or now >= exam["ends_at"]:
            raise HTTPException(400, "Exam is not currently available")

        existing = conn.execute(
            """
            SELECT * FROM exam_attempts
            WHERE exam_id = %s AND student_id = %s
            ORDER BY started_at DESC LIMIT 1
            """,
            (exam_id, student_id),
        ).fetchone()

        if existing:
            if existing["status"] != "in_progress":
                raise HTTPException(409, "You have already submitted this exam")
            if now >= existing["expires_at"]:
                raise HTTPException(409, "Your previous attempt has expired")
            return existing

        attempt_id = uuid.uuid4()
        expires_at = min(
            now + timedelta(minutes=exam["duration_minutes"]),
            exam["ends_at"],
        )

        attempt = conn.execute(
            """
            INSERT INTO exam_attempts
                (id, exam_id, student_id, expires_at)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (attempt_id, exam_id, student_id, expires_at),
        ).fetchone()

    return attempt


@app.put("/attempts/{attempt_id}/answers")
def save_answer(
    attempt_id: uuid.UUID,
    body: AnswerRequest,
    authorization: str | None = Header(default=None),
):
    user = require_student(authorization)
    selected = (
        body.selected_option.strip().upper()
        if body.selected_option is not None
        else None
    )

    if selected is not None and selected not in ("A", "B", "C", "D"):
        raise HTTPException(400, "selected_option must be A, B, C, D, or null")

    with get_connection() as conn:
        attempt = conn.execute(
            """
            SELECT * FROM exam_attempts
            WHERE id = %s AND student_id = %s
            FOR UPDATE
            """,
            (attempt_id, int(user["sub"])),
        ).fetchone()

        if not attempt:
            raise HTTPException(404, "Attempt not found")

        now = datetime.now(timezone.utc)
        if attempt["status"] != "in_progress":
            raise HTTPException(409, "Attempt is not in progress")
        if now >= attempt["expires_at"]:
            raise HTTPException(409, "Attempt has expired")

        question = conn.execute(
            """
            SELECT id FROM questions
            WHERE id = %s AND exam_id = %s
            """,
            (body.question_id, attempt["exam_id"]),
        ).fetchone()

        if not question:
            raise HTTPException(404, "Question not found in this exam")

        conn.execute(
            """
            INSERT INTO attempt_answers
                (attempt_id, question_id, selected_option, updated_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (attempt_id, question_id)
            DO UPDATE SET
                selected_option = EXCLUDED.selected_option,
                updated_at = NOW()
            """,
            (attempt_id, body.question_id, selected),
        )

    return {
        "saved": True,
        "attempt_id": str(attempt_id),
        "question_id": body.question_id,
        "selected_option": selected,
    }



@app.get("/attempts")
def list_attempts(authorization: str | None = Header(default=None)):
    user = authenticated_user(authorization)

    with get_connection() as conn:
        if user.get("role") == "student":
            rows = conn.execute(
                """
                SELECT a.id, a.exam_id, a.student_id, a.started_at,
                       a.expires_at, a.submitted_at, a.status, a.score,
                       a.evaluation_status,
                       e.title AS exam_title,
                       e.total_marks AS exam_total_marks
                FROM exam_attempts AS a
                JOIN exams AS e ON e.id = a.exam_id
                WHERE a.student_id = %s
                ORDER BY COALESCE(a.submitted_at, a.started_at) DESC
                """,
                (int(user["sub"]),),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT a.id, a.exam_id, a.student_id, a.started_at,
                       a.expires_at, a.submitted_at, a.status, a.score,
                       a.evaluation_status,
                       e.title AS exam_title,
                       e.total_marks AS exam_total_marks
                FROM exam_attempts AS a
                JOIN exams AS e ON e.id = a.exam_id
                WHERE e.created_by = %s
                ORDER BY COALESCE(a.submitted_at, a.started_at) DESC
                """,
                (int(user["sub"]),),
            ).fetchall()

    return {"count": len(rows), "attempts": rows}


@app.get("/attempts/{attempt_id}/review")
def review_attempt(
    attempt_id: uuid.UUID,
    authorization: str | None = Header(default=None),
):
    user = authenticated_user(authorization)

    with get_connection() as conn:
        attempt = conn.execute(
            """
            SELECT a.id, a.exam_id, a.student_id, a.started_at,
                   a.submitted_at, a.status, a.score,
                   a.evaluation_status,
                   e.title AS exam_title,
                   e.total_marks AS exam_total_marks,
                   e.negative_marking
            FROM exam_attempts AS a
            JOIN exams AS e ON e.id = a.exam_id
            WHERE a.id = %s
            """,
            (attempt_id,),
        ).fetchone()

        if not attempt:
            raise HTTPException(404, "Attempt not found")

        if (
            user.get("role") == "student"
            and attempt["student_id"] != int(user["sub"])
        ):
            raise HTTPException(403, "You cannot access this attempt")

        if (
            attempt["status"] != "evaluated"
            or attempt["evaluation_status"] != "completed"
        ):
            raise HTTPException(
                409,
                "Answer review is available only after evaluation is completed",
            )

        rows = conn.execute(
            """
            SELECT q.id AS question_id, q.question_text,
                   q.option_a, q.option_b, q.option_c, q.option_d,
                   q.correct_option, q.marks, q.explanation,
                   aa.selected_option
            FROM questions AS q
            LEFT JOIN attempt_answers AS aa
              ON aa.question_id = q.id AND aa.attempt_id = %s
            WHERE q.exam_id = %s
            ORDER BY q.id
            """,
            (attempt_id, attempt["exam_id"]),
        ).fetchall()

    reviewed_questions = []
    penalty = attempt["negative_marking"]

    for question in rows:
        selected = question["selected_option"]
        correct = question["correct_option"].strip()
        selected_key = f"option_{selected.lower()}" if selected else None
        correct_key = f"option_{correct.lower()}"

        if not selected:
            is_correct = False
            awarded = 0
        elif selected == correct:
            is_correct = True
            awarded = question["marks"]
        else:
            is_correct = False
            awarded = -penalty

        reviewed_questions.append({
            "question_id": question["question_id"],
            "question_text": question["question_text"],
            "option_a": question["option_a"],
            "option_b": question["option_b"],
            "option_c": question["option_c"],
            "option_d": question["option_d"],
            "selected_option": selected,
            "selected_answer": (
                question[selected_key] if selected_key else None
            ),
            "correct_option": correct,
            "correct_answer": question[correct_key],
            "is_correct": is_correct,
            "marks": question["marks"],
            "marks_awarded": awarded,
            "explanation": question["explanation"],
        })

    return {
        "attempt": attempt,
        "questions": reviewed_questions,
        "count": len(reviewed_questions),
    }


@app.get("/attempts/{attempt_id}")
def get_attempt(
    attempt_id: uuid.UUID,
    authorization: str | None = Header(default=None),
):
    user = authenticated_user(authorization)

    with get_connection() as conn:
        attempt = conn.execute(
            """
            SELECT * FROM exam_attempts WHERE id = %s
            """,
            (attempt_id,),
        ).fetchone()

        if not attempt:
            raise HTTPException(404, "Attempt not found")

        if user.get("role") != "teacher" and attempt["student_id"] != int(user["sub"]):
            raise HTTPException(403, "You cannot access this attempt")

        answers = conn.execute(
            """
            SELECT question_id, selected_option, updated_at
            FROM attempt_answers
            WHERE attempt_id = %s
            ORDER BY question_id
            """,
            (attempt_id,),
        ).fetchall()

    attempt["answers"] = answers
    return attempt


@app.post("/attempts/{attempt_id}/submit")
def submit_attempt(
    attempt_id: uuid.UUID,
    authorization: str | None = Header(default=None),
):
    user = require_student(authorization)
    student_id = int(user["sub"])

    with get_connection() as conn:
        attempt = conn.execute(
            """
            SELECT * FROM exam_attempts
            WHERE id = %s AND student_id = %s
            FOR UPDATE
            """,
            (attempt_id, student_id),
        ).fetchone()

        if not attempt:
            raise HTTPException(404, "Attempt not found")

        if attempt["status"] != "in_progress":
            return {
                "attempt_id": str(attempt_id),
                "status": attempt["status"],
                "evaluation_status": attempt["evaluation_status"],
            }

        now = datetime.now(timezone.utc)
        conn.execute(
            """
            UPDATE exam_attempts
            SET status = 'submitted', submitted_at = %s,
                evaluation_status = 'queued'
            WHERE id = %s
            """,
            (now, attempt_id),
        )

        answers = conn.execute(
            """
            SELECT question_id, selected_option
            FROM attempt_answers
            WHERE attempt_id = %s
            ORDER BY question_id
            """,
            (attempt_id,),
        ).fetchall()

    event = {
        "event_id": str(uuid.uuid4()),
        "attempt_id": str(attempt_id),
        "exam_id": attempt["exam_id"],
        "student_id": student_id,
        "submitted_at": now.isoformat(),
        "answers": [
            {
                "question_id": answer["question_id"],
                "selected_option": answer["selected_option"],
            }
            for answer in answers
        ],
    }

    try:
        publish_submission(event)
    except Exception:
        # Submission is retained in PostgreSQL even if RabbitMQ is unavailable.
        # The evaluation status remains queued for later retry integration.
        raise HTTPException(
            503,
            "Attempt was submitted, but the evaluation event could not be queued. Contact the system operator.",
        )

    return {
        "attempt_id": str(attempt_id),
        "status": "submitted",
        "evaluation_status": "queued",
        "message": "Submission accepted for asynchronous evaluation",
    }
