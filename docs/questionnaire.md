# Standardized route questionnaire

## Protocol and administration

`route-study-v1` is a fixed research protocol for non-specialists in autonomous
navigation, following the experimental design in `refs/tcc_01.pdf`.
It uses six distinct saved scenarios in administrator-selected order. Scenarios
belong to the questionnaire and contain a successful calculation, a map and two
distinct routes. The first three also require both group explanations.
Generate maps individually or add or import configurations into a queue, then
review routes, calculate results and name saved scenarios using the existing
simulation workflow. Automatic batch map generation is unavailable in this mode.

`PUT /api/questionnaires/{id}/protocol` accepts:

```json
{
  "explanation_scenario_ids": [1, 2, 3],
  "prediction_scenario_ids": [4, 5, 6]
}
```

These numbers are example identifiers. Saving creates fourteen question records:
three route assessments, eight Likert items and three route predictions.
Saving the same selection preserves question identifiers. A different selection
replaces the generated questions while the questionnaire is still a draft.
Prompts, item order and scale bounds cannot be edited manually.
Activation requires a complete valid protocol and locks editing. Closing a study
rejects unfinished participations and new attempts; completed submissions can be
retried without creating another record.

The schema is for an empty database. No migrations, legacy question types or
legacy participation endpoints are provided. Database initialization never
silently drops or converts existing tables.

## Participant sequence

There are seventeen content steps and a final submission action:

1. For each of three scenarios, participants choose the route they consider
   faster, select an integer confidence from 0 to 100, and explain their choice
   in 20 to 1,000 characters, excluding surrounding whitespace. No value is
   preselected. All three fields are required and
   saved together as `{choice, confidence, reason}`. `choice` is the displayed
   route index (0 for A, 1 for B).
2. After each assessment is saved, its explanation is shown on a separate step.
   Control participants receive `cost_baseline_text`. Experimental participants
   receive `explanation_text` and the contrastive map with semantic interventions.
   The explanation compares the saved optimal/alternative routes regardless of
   which route the participant selected; the participant's text is not used to
   generate a different explanation.
3. Participants rate eight statements about the explanations received, each on
   the same five-point scale. Every item is required.
4. In three unseen prediction scenarios, participants choose the route they
   believe the system would select. No cost, explanation, route identity or
   correctness feedback is delivered during this phase, including after choices.
5. Participants submit to mark the already saved answers complete.

The server permits only the current step. Confirmed responses cannot be edited,
and participants cannot return to earlier explanations. The same attempt resumes
after reloading in the same tab. New tabs or cleared session storage can create
new attempts; the system does not identify a person across devices or sessions.
Group assignment is stable per attempt. Route order is deterministic per attempt
and question, with identical route styling before disclosure.

## Adapted Explanation Satisfaction Scale

The displayed title is **Explanation Satisfaction Scale (ESS), adapted for route
planning**. The eight items preserve the dimensions of Appendix C in
`refs/eval_hoffman2019.pdf`, adapting the referent to route decisions and the
wording to the three explanations collectively:

| Item | Dimension | Adapted statement |
| --- | --- | --- |
| ess_1 | Understanding | From the explanations, I understand how the system chooses routes. |
| ess_2 | Satisfaction | The explanations of how the system chooses routes are satisfying. |
| ess_3 | Detail | The explanations of how the system chooses routes have sufficient detail. |
| ess_4 | Completeness | The explanations of how the system chooses routes seem complete. |
| ess_5 | Use | The explanations tell me how to use the system’s route recommendations. |
| ess_6 | Goal usefulness | The explanations are useful for identifying the fastest route. |
| ess_7 | Perceived accuracy | The explanations help me assess how accurately the system identifies the fastest route. |
| ess_8 | Calibrated reliance | The explanations let me judge when I should and should not trust the system’s route choices. |

Response labels are 1: Strongly disagree; 2: Somewhat disagree; 3: Neither agree
nor disagree; 4: Somewhat agree; 5: Strongly agree. All items use positive wording;
none requires reverse scoring. This domain adaptation has not itself been
psychometrically validated. Raw responses are exported without an automatic
aggregate score or inferred claim of objective comprehension.

The reference set informs the implementation as follows:

- Hoffman, *Metrics for Explainable AI: Challenges and Prospects*, Appendix C:
  eight ESS items; satisfaction differs from mental models and performance.
- Korpan, *Evaluation of a Robot Navigator's Explanations*: a post-scenario survey
  and prediction of behavior in new scenarios; detailed explanations can affect
  perceived understanding differently from immediate comprehensibility.
- Zou and Borst, *Algorithmic Transparency in Path Planning*: distinguish tested
  understanding, self-rated confidence (0 to 100) and response time.
- Silva et al., *Evaluating the Objective and Subjective Impacts of xAI on
  Human-Agent Interaction*: retain separate subjective and objective measures.
- Holzinger et al., *The System Causability Scale*: causal understanding is
  contextual. This protocol uses ESS, not a combined ESS/SCS score.
- Abuzied, *Closing the Transparency Gap*: explanation timing and prediction
  motivate measurement of policy alignment. Prediction accuracy here is a
  proportion of route choices matching the planner, not the article's KL-based
  Policy Divergence. Three interleaved training assessments do not constitute
  a separate pre-intervention prediction baseline.
- Fernández-Becerra et al., *Generating Trustworthy and Context-Aware
  Explanations*: preserve original scenario facts and explanations for inspection
  of factual grounding. Open responses before disclosure capture participants'
  initial reasoning; they do not establish a causal post-explanation improvement.
- Chen et al., *Towards Transparent Robotic Planning via Contrastive
  Explanations*: explanation content and reading time can have different effects;
  do not assume shorter explanations necessarily improve every outcome.

## APIs and preview

- `GET /api/participate/{token}?submission_key={uuid}` opens or resumes an attempt
  and returns only its current `step`, `current_step`, `total_steps`, questionnaire
  details and completion status. Public responses use `Cache-Control: no-store`.
- `POST /api/participate/{token}/steps/{step}/confirm` accepts `submission_key`,
  `value` and nonnegative integer `visible_duration_ms`. Steps are zero-based.
  Assessment values are objects; Likert values are integers from 1 to 5;
  prediction values are 0 or 1. Explanation steps use `value: null`.
- Confirming a step atomically saves its answer/timing and advances progress.
  An identical retry returns current progress without modifying the saved timing.
  A different answer for a confirmed step or a future step returns HTTP 409.
- `POST /api/participate/{token}/submit` accepts only `submission_key` and succeeds
  once all seventeen steps are confirmed. Identical retries are idempotent.
- `GET /api/questionnaires/{id}/preview?group=control&step=0&submission_key={uuid}`
  renders any valid preview step through the same serializer used by participation.
  The group can also be `experimental`. Preview never creates participations or
  answers; its progression is kept in the administrator's browser.

Administrative preview is available only through the local API. The public API
and participant-only frontend expose only participation endpoints.

After activation, open the local participant link from the administration screen
to exercise the real participation flow without a public URL. This link uses
the current dashboard address and serves only this installation, not external
participants. Confirmed steps are saved in PostgreSQL, and reloading the same
browser tab resumes the attempt. Submit after the final step to include the
participation in exports. The administrative preview never saves responses.

## Export and timing

`GET /api/questionnaires/{id}/export` requires the configured `X-Export-Key`.
Only completed participations are exported. The JSON includes protocol version,
ordered selected scenarios, question prompts and ESS identifiers, adaptation
metadata, scenario maps/costs/explanations, groups, raw responses and route order.
For route responses, use `route_order[choice]` to recover whether the participant
selected `optimal` or `alternative`. Prediction accuracy can be calculated from
the three `route_prediction` records. Secrets and submission keys are excluded.

| Field | Meaning |
| --- | --- |
| started_at | Server time when the attempt was first opened |
| completed_at | Server time of final submission |
| confirmed_at | Server time when the response was saved |
| explanation_completed_at | Server time when the explanation was acknowledged |
| visible_duration_ms | Accumulated foreground viewing time for a question, including its explanation if applicable |
| decision_visible_duration_ms | Foreground time for the route decision, including confidence/reason for assessments; null for Likert items |
| explanation_visible_duration_ms | Foreground reading time on an explanation step; null for questions without an explanation |

Durations are milliseconds measured in the browser with `performance.now()`.
They exclude hidden-tab intervals and pending requests. Timing checkpoints in
session storage preserve accumulated exposure across reloads. They are client
measurements rather than independently verified measures of attention.
