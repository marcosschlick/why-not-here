from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from web.api.study_protocol import ExplanationResponse, RouteAssessment, RoutePrediction


class StepProgress(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    value: Any = None
    visible_duration_ms: int = Field(ge=0)
    route_confirmed: bool = False
    first_selection_visible_duration_ms: int | None = Field(default=None, ge=0)
    final_selection_visible_duration_ms: int | None = Field(default=None, ge=0)
    decision_visible_duration_ms: int | None = Field(default=None, ge=0)
    choice_changed: bool = False


def normalized_answer(kind, value):
    models = {
        "route_assessment": RouteAssessment,
        "route_prediction": RoutePrediction,
        "explanation": ExplanationResponse,
    }
    if kind in models:
        try:
            return models[kind].model_validate(value).model_dump()
        except ValidationError as error:
            raise HTTPException(
                status_code=422,
                detail="Complete all required fields: route choice, integer confidence from 0 to 100, and any required reason of 20 to 1000 characters",
            ) from error
    if kind == "likert" and type(value) is int and 1 <= value <= 5:
        return value
    raise HTTPException(status_code=422, detail="Invalid answer for this step")


def validate_progress(kind, progress: StepProgress, saved=None, *, complete=False):
    value = progress.value
    is_route = kind in {"route_assessment", "route_prediction"}
    invalid = False
    if kind == "likert":
        invalid = value is not None and (type(value) is not int or not 1 <= value <= 5)
    else:
        allowed = {"reason"} if kind == "explanation" else {"choice", "confidence"}
        if kind == "route_assessment":
            allowed.add("reason")
        invalid = not isinstance(value, dict) or bool(set(value) - allowed)
        if not invalid:
            for field, maximum in (("choice", 1), ("confidence", 100)):
                entry = value.get(field)
                if entry is not None and (
                    type(entry) is not int or not 0 <= entry <= maximum
                ):
                    invalid = True
            if "reason" in value and (
                not isinstance(value["reason"], str) or len(value["reason"]) > 1000
            ):
                invalid = True
    if invalid:
        raise HTTPException(
            status_code=422, detail="Invalid partial answer for this step"
        )
    first = progress.first_selection_visible_duration_ms
    final = progress.final_selection_visible_duration_ms
    decision = progress.decision_visible_duration_ms
    if is_route and value.get("choice") is not None:
        invalid = (
            first is None
            or final is None
            or not first <= final <= progress.visible_duration_ms
        )
        invalid |= not progress.choice_changed and first != final
        if progress.route_confirmed:
            invalid |= decision is None or (
                final is not None
                and not final <= decision <= progress.visible_duration_ms
            )
        else:
            invalid |= (
                decision is not None
                or value.get("confidence") is not None
                or bool(value.get("reason"))
            )
    else:
        invalid = (
            any(t is not None for t in (first, final, decision))
            or progress.route_confirmed
            or progress.choice_changed
        )
        if is_route:
            invalid |= value.get("confidence") is not None or bool(value.get("reason"))
    if invalid:
        raise HTTPException(status_code=422, detail="Invalid route selection timing")
    if saved:
        if progress.visible_duration_ms < saved["visible_duration_ms"]:
            raise HTTPException(
                status_code=409,
                detail="Saved viewing time cannot decrease. Reload this questionnaire.",
            )
        if is_route and saved["first_selection_visible_duration_ms"] is not None:
            changed_choice = value.get("choice") != saved["value"].get("choice")
            if (
                first != saved["first_selection_visible_duration_ms"]
                or final is None
                or final < saved["final_selection_visible_duration_ms"]
                or (
                    (changed_choice or saved["choice_changed"])
                    and not progress.choice_changed
                )
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Saved route selection history cannot be replaced. Reload this questionnaire.",
                )
        if saved["route_confirmed"] and (
            not progress.route_confirmed
            or value.get("choice") != saved["value"].get("choice")
            or any(
                progress.model_dump()[key] != saved[key]
                for key in (
                    "first_selection_visible_duration_ms",
                    "final_selection_visible_duration_ms",
                    "decision_visible_duration_ms",
                    "choice_changed",
                )
            )
        ):
            raise HTTPException(
                status_code=409, detail="The route choice has already been confirmed"
            )
    if complete:
        if is_route and not progress.route_confirmed:
            raise HTTPException(
                status_code=422, detail="Confirm your route before continuing"
            )
        return normalized_answer(kind, value)
    return value
