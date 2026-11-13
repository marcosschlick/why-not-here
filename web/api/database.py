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
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
            protocol_version TEXT NOT NULL DEFAULT 'route-study-v1',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMPTZ,
            access_token TEXT UNIQUE,
            group_secret TEXT
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS scenarios (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            questionnaire_id BIGINT NOT NULL REFERENCES questionnaires(id),
            title TEXT NOT NULL,
            configuration JSONB NOT NULL,
            data JSONB NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS questions (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            questionnaire_id BIGINT NOT NULL REFERENCES questionnaires(id),
            scenario_id BIGINT REFERENCES scenarios(id),
            prompt TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('route_assessment', 'likert', 'route_prediction')),
            configuration JSONB NOT NULL,
            position INTEGER NOT NULL,
            UNIQUE (questionnaire_id, position)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS participation_keys (
            questionnaire_id BIGINT NOT NULL REFERENCES questionnaires(id),
            key TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (questionnaire_id, key)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS participations (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            questionnaire_id BIGINT NOT NULL REFERENCES questionnaires(id),
            submission_key UUID NOT NULL,
            participant_name TEXT NOT NULL,
            participant_email TEXT NOT NULL,
            participation_key TEXT NOT NULL,
            FOREIGN KEY (questionnaire_id, participation_key)
                REFERENCES participation_keys(questionnaire_id, key),
            UNIQUE (questionnaire_id, participant_email),
            UNIQUE (questionnaire_id, participation_key),
            study_group TEXT NOT NULL CHECK (study_group IN ('control', 'experimental')),
            current_step SMALLINT NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 17),
            started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMPTZ,
            UNIQUE (questionnaire_id, submission_key)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS answers (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            participation_id BIGINT NOT NULL REFERENCES participations(id),
            question_id BIGINT NOT NULL REFERENCES questions(id),
            value JSONB NOT NULL,
            route_order JSONB,
            confirmed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            explanation_completed_at TIMESTAMPTZ,
            visible_duration_ms BIGINT NOT NULL CHECK (visible_duration_ms >= 0),
            decision_visible_duration_ms BIGINT CHECK (decision_visible_duration_ms >= 0),
            explanation_visible_duration_ms BIGINT CHECK (explanation_visible_duration_ms >= 0),
            UNIQUE (participation_id, question_id)
        )
        """,
    )
    try:
        with connect_database() as connection:
            connection.execute(
                "SELECT pg_advisory_xact_lock(hashtext('why-not-here-schema'))"
            )
            for statement in statements:
                connection.execute(statement)
    except (KeyError, psycopg.Error) as error:
        raise RuntimeError("Failed to initialize the PostgreSQL database") from error
