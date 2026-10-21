import json
import logging
import os
import time
from decimal import Decimal

import pika
import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ["DATABASE_URL"]
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "exam_user")
RABBITMQ_PASSWORD = os.environ["RABBITMQ_PASSWORD"]
QUEUE_NAME = "exam_submissions"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("evaluation_worker")


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def evaluate_submission(event):
    attempt_id = event["attempt_id"]
    exam_id = int(event["exam_id"])

    with get_connection() as conn:
        with conn.transaction():
            attempt = conn.execute(
                """
                SELECT id, exam_id, status, evaluation_status
                FROM exam_attempts
                WHERE id = %s AND exam_id = %s
                FOR UPDATE
                """,
                (attempt_id, exam_id),
            ).fetchone()

            if not attempt:
                raise ValueError(
                    f"Attempt {attempt_id} for exam {exam_id} was not found"
                )

            # Safe for redelivered RabbitMQ messages.
            if attempt["evaluation_status"] == "completed":
                logger.info("Attempt %s was already evaluated", attempt_id)
                return

            if attempt["status"] != "submitted":
                raise ValueError(
                    f"Attempt {attempt_id} is not in submitted state"
                )

            exam = conn.execute(
                """
                SELECT total_marks, negative_marking
                FROM exams
                WHERE id = %s
                """,
                (exam_id,),
            ).fetchone()

            if not exam:
                raise ValueError(f"Exam {exam_id} was not found")

            answers = conn.execute(
                """
                SELECT question_id, selected_option
                FROM attempt_answers
                WHERE attempt_id = %s
                """,
                (attempt_id,),
            ).fetchall()

            questions = conn.execute(
                """
                SELECT id, correct_option, marks
                FROM questions
                WHERE exam_id = %s
                """,
                (exam_id,),
            ).fetchall()

            question_map = {int(q["id"]): q for q in questions}
            penalty = Decimal(str(exam["negative_marking"]))
            score = Decimal("0")

            for answer in answers:
                question = question_map.get(int(answer["question_id"]))
                if question is None:
                    continue

                selected = answer["selected_option"]
                if selected is None:
                    continue

                if selected.upper() == question["correct_option"].strip().upper():
                    score += Decimal(str(question["marks"]))
                else:
                    score -= penalty

            # Keep the final score within 0 and the exam's configured total.
            score = max(Decimal("0"), score)
            score = min(score, Decimal(str(exam["total_marks"])))
            score = score.quantize(Decimal("0.01"))

            conn.execute(
                """
                UPDATE exam_attempts
                SET score = %s,
                    status = 'evaluated',
                    evaluation_status = 'completed'
                WHERE id = %s
                """,
                (score, attempt_id),
            )

    logger.info("Evaluated attempt %s: score=%s", attempt_id, score)


def on_message(channel, method, properties, body):
    try:
        event = json.loads(body.decode("utf-8"))
        evaluate_submission(event)
        channel.basic_ack(delivery_tag=method.delivery_tag)
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        logger.error("Invalid submission message; rejecting it: %s", exc)
        channel.basic_reject(
            delivery_tag=method.delivery_tag,
            requeue=False,
        )
    except Exception:
        logger.exception("Evaluation failed; message will be requeued")
        channel.basic_nack(
            delivery_tag=method.delivery_tag,
            requeue=True,
        )


def main():
    while True:
        connection = None
        try:
            credentials = pika.PlainCredentials(
                RABBITMQ_USER, RABBITMQ_PASSWORD
            )
            parameters = pika.ConnectionParameters(
                host=RABBITMQ_HOST,
                credentials=credentials,
                heartbeat=60,
                blocked_connection_timeout=120,
            )

            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()
            channel.queue_declare(
                queue=QUEUE_NAME,
                durable=True,
            )
            channel.basic_qos(prefetch_count=1)
            channel.basic_consume(
                queue=QUEUE_NAME,
                on_message_callback=on_message,
                auto_ack=False,
            )

            logger.info("Waiting for messages on queue %s", QUEUE_NAME)
            channel.start_consuming()

        except KeyboardInterrupt:
            logger.info("Worker interrupted")
            break
        except Exception:
            logger.exception("Worker connection failed; retrying in 5 seconds")
            time.sleep(5)
        finally:
            if connection is not None and connection.is_open:
                connection.close()


if __name__ == "__main__":
    main()
