from dataclasses import dataclass

INSTRUMENT_TITLE = "Adapted route explanation questionnaire"
SOURCES = {
    "ESS": "Hoffman et al., Metrics for Explainable AI: Challenges and Prospects, Appendix C",
    "SCS": "Holzinger et al., Measuring the Quality of Explanations: The System Causability Scale, Section 5",
    "xHIS": "Silva et al., Evaluating the Objective and Subjective Impacts of xAI on Human-Agent Interaction, Section 4.9",
}


@dataclass(frozen=True)
class RatingItem:
    source_scale: str
    source_item_number: int
    topic: str
    prompt: str

    def metadata(self) -> dict:
        return {
            "item_id": f"{self.source_scale.lower()}_{self.source_item_number}",
            "source_scale": self.source_scale,
            "source_item_number": self.source_item_number,
            "source": SOURCES[self.source_scale],
            "topic": self.topic,
        }


RATING_ITEMS = (
    RatingItem(
        "ESS",
        1,
        "Understanding and causality",
        "From the explanations, I understand how the route-planning system works.",
    ),
    RatingItem(
        "SCS",
        5,
        "Understanding and causality",
        "I found the explanations helped me understand cause-and-effect relationships in the system’s route choices.",
    ),
    RatingItem(
        "xHIS",
        10,
        "Understanding and causality",
        "I understand why the system used specific information in its explanations.",
    ),
    RatingItem(
        "ESS",
        3,
        "Detail, completeness and consistency",
        "The explanations of how the route-planning system works have sufficient detail.",
    ),
    RatingItem(
        "ESS",
        4,
        "Detail, completeness and consistency",
        "The explanations of how the route-planning system works seem complete.",
    ),
    RatingItem(
        "SCS",
        7,
        "Detail, completeness and consistency",
        "I did not find inconsistencies between explanations.",
    ),
    RatingItem(
        "ESS",
        2,
        "Satisfaction and usefulness",
        "The explanations of how the route-planning system works are satisfying.",
    ),
    RatingItem(
        "xHIS", 25, "Satisfaction and usefulness", "The explanations were useful."
    ),
    RatingItem(
        "xHIS",
        18,
        "Satisfaction and usefulness",
        "The explanations were an important resource for me to answer the questions about the system’s route choices.",
    ),
    RatingItem(
        "ESS",
        5,
        "Use and application to new situations",
        "The explanations of how the route-planning system works tell me how to use it.",
    ),
    RatingItem(
        "SCS",
        6,
        "Use and application to new situations",
        "I was able to use the explanations with my existing knowledge.",
    ),
    RatingItem(
        "xHIS",
        12,
        "Use and application to new situations",
        "I could have applied the system’s reasoning to new route-planning problems, even if it had not given me suggestions.",
    ),
    RatingItem(
        "ESS",
        7,
        "Accuracy and trust judgment",
        "The explanations of the route-planning system show me how accurate it is.",
    ),
    RatingItem(
        "ESS",
        8,
        "Accuracy and trust judgment",
        "The explanations let me judge when I should trust and not trust the route-planning system.",
    ),
)
QUESTION_COUNT = 6 + len(RATING_ITEMS)
STUDY_STEP_COUNT = QUESTION_COUNT + 3
