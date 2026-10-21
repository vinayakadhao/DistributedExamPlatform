import os
from contextlib import asynccontextmanager

import jwt
import psycopg
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field, EmailStr
from pwdlib import PasswordHash
from psycopg.rows import dict_row
from psycopg.errors import UniqueViolation
from datetime import datetime, timedelta, timezone

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
TOKEN_MINUTES = 60

password_hash = PasswordHash.recommended()


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


@asynccontextmanager
async def lifespan(app: FastAPI):
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id BIGSERIAL PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                email VARCHAR(254) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
    yield


app = FastAPI(title="Exam Platform Authentication Service", lifespan=lifespan)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


def make_token(user):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user["id"]),
            "email": user["email"],
            "role": user["role"],
            "iat": now,
            "exp": now + timedelta(minutes=TOKEN_MINUTES),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


@app.get("/health")
def health():
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1")
        return {"service": "auth", "status": "healthy"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable")


@app.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest):
    role = body.role.strip().lower()
    if role not in ("teacher", "student"):
        raise HTTPException(400, "Role must be teacher or student")

    hashed = password_hash.hash(body.password)
    try:
        with get_connection() as conn:
            user = conn.execute(
                """
                INSERT INTO users (name, email, password_hash, role)
                VALUES (%s, %s, %s, %s)
                RETURNING id, name, email, role, created_at
                """,
                (body.name.strip(), str(body.email).lower(), hashed, role),
            ).fetchone()
        return {"user": user, "access_token": make_token(user), "token_type": "bearer"}
    except UniqueViolation:
        raise HTTPException(409, "An account with this email already exists")


@app.post("/login")
def login(body: LoginRequest):
    with get_connection() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE email = %s",
            (str(body.email).lower(),),
        ).fetchone()

    if not user or not password_hash.verify(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    public_user = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
    }
    return {
        "user": public_user,
        "access_token": make_token(public_user),
        "token_type": "bearer",
    }


@app.get("/verify")
def verify_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {"valid": True, "user_id": payload["sub"], "email": payload["email"], "role": payload["role"]}
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid or expired token")
