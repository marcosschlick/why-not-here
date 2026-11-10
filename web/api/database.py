import os

import psycopg
from psycopg.rows import dict_row


def connect_database() -> psycopg.Connection:
    return psycopg.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=os.getenv("DB_PORT", "5432"),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        dbname=os.environ["DB_NAME"],
        connect_timeout=5,
        row_factory=dict_row,
    )


def initialize_database() -> None:
    statements = (
        """
        CREATE TABLE IF NOT EXISTS questionnaires (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS scenarios (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            questionnaire_id BIGINT NOT NULL REFERENCES questionnaires(id),
            title TEXT NOT NULL,
            configuration JSONB NOT NULL DEFAULT '{}'::jsonb
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS questions (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            scenario_id BIGINT NOT NULL REFERENCES scenarios(id),
            prompt TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS participations (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            questionnaire_id BIGINT NOT NULL REFERENCES questionnaires(id),
            started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMPTZ
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS answers (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            participation_id BIGINT NOT NULL REFERENCES participations(id),
            question_id BIGINT NOT NULL REFERENCES questions(id),
            value JSONB NOT NULL,
            UNIQUE (participation_id, question_id)
        )
        """,
        "ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'",
        "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS questionnaire_id BIGINT REFERENCES questionnaires(id)",
        "ALTER TABLE questions ALTER COLUMN scenario_id DROP NOT NULL",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text'",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS configuration JSONB NOT NULL DEFAULT '{}'::jsonb",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS position INTEGER",
        """
        WITH ordered AS (
            SELECT id, COALESCE((SELECT MAX(q.position) FROM questions q
                WHERE q.questionnaire_id = questions.questionnaire_id), 0)
                + ROW_NUMBER() OVER (PARTITION BY questionnaire_id ORDER BY id) AS new_position
            FROM questions WHERE position IS NULL
        )
        UPDATE questions SET position = ordered.new_position FROM ordered WHERE questions.id = ordered.id
        """,
        "ALTER TABLE questions ALTER COLUMN position SET NOT NULL",
        """
        UPDATE questions SET questionnaire_id = scenarios.questionnaire_id
        FROM scenarios
        WHERE questions.scenario_id = scenarios.id AND questions.questionnaire_id IS NULL
        """,
        "ALTER TABLE questions ALTER COLUMN questionnaire_id SET NOT NULL",
    )
    try:
        with connect_database() as connection:
            for statement in statements:
                connection.execute(statement)
    except (KeyError, psycopg.Error) as error:
        raise RuntimeError("Failed to initialize the PostgreSQL database") from error
