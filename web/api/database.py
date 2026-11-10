import os

import psycopg


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
    )
    try:
        with psycopg.connect(
            host=os.getenv("DB_HOST", "127.0.0.1"),
            port=os.getenv("DB_PORT", "5432"),
            user=os.environ["DB_USER"],
            password=os.environ["DB_PASSWORD"],
            dbname=os.environ["DB_NAME"],
            connect_timeout=5,
        ) as connection:
            for statement in statements:
                connection.execute(statement)
    except (KeyError, psycopg.Error) as error:
        raise RuntimeError("Failed to initialize the PostgreSQL database") from error
