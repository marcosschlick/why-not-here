from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Response, status
from psycopg import errors
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from web.api.database import connect_database

router = APIRouter(prefix="/api/questionnaires", tags=["questionnaires"])

NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class QuestionnaireInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: NonEmptyText
    description: str | None = None


class EmptyConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChoiceConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    options: list[NonEmptyText] = Field(min_length=2)


class LikertConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min: int = Field(strict=True)
    max: int = Field(strict=True)

    @model_validator(mode="after")
    def validate_bounds(self):
        if self.min >= self.max:
            raise ValueError("Minimum must be less than maximum")
        return self


class NumericConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    min: float | None = None
    max: float | None = None

    @model_validator(mode="after")
    def validate_bounds(self):
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("Minimum must not exceed maximum")
        return self


class QuestionBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: NonEmptyText


class TextQuestion(QuestionBase):
    type: Literal["text"]
    configuration: EmptyConfiguration = Field(default_factory=EmptyConfiguration)


class ChoiceQuestion(QuestionBase):
    type: Literal["choice"]
    configuration: ChoiceConfiguration


class LikertQuestion(QuestionBase):
    type: Literal["likert"]
    configuration: LikertConfiguration


class NumericQuestion(QuestionBase):
    type: Literal["numeric"]
    configuration: NumericConfiguration = Field(default_factory=NumericConfiguration)


QuestionInput = Annotated[
    TextQuestion | ChoiceQuestion | LikertQuestion | NumericQuestion,
    Field(discriminator="type"),
]


def get_questionnaire(connection, questionnaire_id: int, *, lock: bool = False):
    query = "SELECT id, title, description, status, created_at FROM questionnaires WHERE id = %s"
    if lock:
        query += " FOR UPDATE"
    questionnaire = connection.execute(query, (questionnaire_id,)).fetchone()
    if questionnaire is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    return questionnaire


def require_draft(connection, questionnaire_id: int):
    questionnaire = get_questionnaire(connection, questionnaire_id, lock=True)
    if questionnaire["status"] != "draft":
        raise HTTPException(status_code=409, detail="Questionnaire is not a draft")
    return questionnaire


@router.post("", status_code=status.HTTP_201_CREATED)
def create_questionnaire(payload: QuestionnaireInput):
    with connect_database() as connection:
        return connection.execute(
            "INSERT INTO questionnaires (title, description) VALUES (%s, %s) "
            "RETURNING id, title, description, status, created_at",
            (payload.title, payload.description),
        ).fetchone()


@router.get("")
def list_questionnaires():
    with connect_database() as connection:
        return connection.execute(
            "SELECT id, title, description, status, created_at "
            "FROM questionnaires ORDER BY id"
        ).fetchall()


@router.get("/{questionnaire_id}")
def read_questionnaire(questionnaire_id: int):
    with connect_database() as connection:
        questionnaire = get_questionnaire(connection, questionnaire_id)
        questionnaire["questions"] = connection.execute(
            "SELECT id, prompt, type, configuration FROM questions "
            "WHERE questionnaire_id = %s ORDER BY id",
            (questionnaire_id,),
        ).fetchall()
        return questionnaire


@router.put("/{questionnaire_id}")
def update_questionnaire(questionnaire_id: int, payload: QuestionnaireInput):
    with connect_database() as connection:
        require_draft(connection, questionnaire_id)
        return connection.execute(
            "UPDATE questionnaires SET title = %s, description = %s WHERE id = %s "
            "RETURNING id, title, description, status, created_at",
            (payload.title, payload.description, questionnaire_id),
        ).fetchone()


@router.post("/{questionnaire_id}/questions", status_code=status.HTTP_201_CREATED)
def create_question(questionnaire_id: int, payload: QuestionInput):
    with connect_database() as connection:
        require_draft(connection, questionnaire_id)
        return connection.execute(
            "INSERT INTO questions (questionnaire_id, prompt, type, configuration) "
            "VALUES (%s, %s, %s, %s) RETURNING id, prompt, type, configuration",
            (
                questionnaire_id,
                payload.prompt,
                payload.type,
                Jsonb(payload.configuration.model_dump(exclude_none=True)),
            ),
        ).fetchone()


@router.put("/{questionnaire_id}/questions/{question_id}")
def update_question(questionnaire_id: int, question_id: int, payload: QuestionInput):
    with connect_database() as connection:
        require_draft(connection, questionnaire_id)
        question = connection.execute(
            "UPDATE questions SET prompt = %s, type = %s, configuration = %s "
            "WHERE id = %s AND questionnaire_id = %s "
            "RETURNING id, prompt, type, configuration",
            (
                payload.prompt,
                payload.type,
                Jsonb(payload.configuration.model_dump(exclude_none=True)),
                question_id,
                questionnaire_id,
            ),
        ).fetchone()
        if question is None:
            raise HTTPException(status_code=404, detail="Question not found")
        return question


@router.delete("/{questionnaire_id}/questions/{question_id}", status_code=204)
def delete_question(questionnaire_id: int, question_id: int):
    try:
        with connect_database() as connection:
            require_draft(connection, questionnaire_id)
            question = connection.execute(
                "DELETE FROM questions WHERE id = %s AND questionnaire_id = %s RETURNING id",
                (question_id, questionnaire_id),
            ).fetchone()
            if question is None:
                raise HTTPException(status_code=404, detail="Question not found")
    except errors.ForeignKeyViolation as error:
        raise HTTPException(status_code=409, detail="Question has answers") from error
    return Response(status_code=204)
