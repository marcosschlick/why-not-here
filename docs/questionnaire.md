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

## Participation overview

Draft questionnaires retain the title, description, study protocol and scenario
editor. Active and closed questionnaires show a read-only title and description,
participation counts. Draft and active questionnaires include key management;
closed questionnaires omit it entirely. Active studies also retain participant
access and closure controls. Editing remains prohibited after activation.

Use **View scenarios** to reveal the saved scenarios and maps without creation
or rename controls. **Hide scenarios** returns to the overview. Participant
preview remains available for both groups; opening preview and scenario views
is mutually exclusive. Selecting another questionnaire returns to its overview.

The participation panel shows **Completed**, **In progress** and **Total started**.
It loads when the overview opens; **Refresh participation counts** reloads only
the counts, without automatic polling. Completed means final submission has set
`completed_at`; a participation with all steps answered but not yet submitted
still counts as in progress. Closed studies retain counts of incomplete attempts.
Loading is shown separately from a real zero, and errors can be retried locally.

`GET /api/questionnaires/{id}/participation-summary` is a local administrative
endpoint returning `{total, completed, in_progress}`. It uses `Cache-Control:
no-store`, returns 404 for an unknown questionnaire and exposes no participant
identities. No schema changes are required.

## Participation keys

Draft and active questionnaires show a compact **Participation keys** section.
**Generate keys** opens an inline quantity form (default 10, range 1 to 1,000).
**Cancel** closes it without creating keys. A successful generation closes the
form and shows the new keys first under **Available** without copying them.

The **Available** and **Used** filters show their counts and share one scrollable
list. Available rows have a **Copy** button for individual distribution; used rows
are read-only. **Copy available keys** is a secondary action that copies all
available keys separated by newlines. The clipboard receives only key values,
without labels. Copy and generation results are announced in the section;
clipboard and request failures can be retried without leaving the questionnaire.

**Refresh** reloads usage manually. Empty filters have their own empty states,
and loading failures are not shown as an empty inventory. Selecting another
questionnaire resets the form, filter and feedback. Closed questionnaires neither
show this section nor request its key list; existing key records remain stored.

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
and participants cannot return to earlier explanations. Before starting, each
participant supplies a name, email and individual key. The key is consumed at
start, even if the participant does not finish. Email addresses are trimmed and
lowercased, and each email and key can belong to only one participation in the
same questionnaire. No email ownership verification is performed.
The same attempt resumes after reloading in the same tab. Closing the tab or
clearing session storage loses access; the consumed key cannot start again in
another session.
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
psychometrically validated. Raw responses are stored without an automatic
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

- `POST /api/questionnaires/{id}/participation-keys` accepts `quantity` (an integer
  from 1 to 1,000) and generates individual keys for a draft or active study.
  `GET` on the same endpoint lists `key`, `created_at` and `used`. These are local
  administrative endpoints; keys are not exposed through the participant API.
- `POST /api/participate/start` accepts `name`, `email`, `key` and
  `submission_key` (a browser-generated random UUID). The globally unique key
  identifies the questionnaire. It atomically reserves the key and email, creates
  a participation and returns its current state plus an internal `access_token`.
  The token is kept in the tab's session storage for subsequent API requests;
  it never appears in the participant page address. Retrying
  with the same session and identical normalized data returns the same attempt.
  Names are trimmed, nonempty and limited to 200 characters; emails are validated
  and limited to 254 characters. Invalid keys return 401, used keys or emails 409,
  and closed questionnaires 410. Validation failures do not consume keys.
- `GET /api/participate/{token}?submission_key={uuid}` resumes an existing attempt
  and returns only its current `step`, `current_step`, `total_steps`, questionnaire
  details and completion status. It never creates a participation. Unknown
  sessions cannot load steps, confirm answers or submit. Public state responses
  use `Cache-Control: no-store`.
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

After activation, use **Open questionnaire** under **Local participation** in
administration to open `/questionnaire` in a new tab. **Copy link** copies its
absolute local address and confirms success; clipboard failures are reported.
The path contains no token, query or fragment. A participant's individual key
identifies the study, allowing multiple active questionnaires at the same address.
This link uses the current dashboard origin and serves only this installation,
not external participants. Optional public participation controls use the same
path on the configured public origin. Previous token-based links are not supported.
Confirmed steps are saved in PostgreSQL, and reloading the same browser tab resumes
the attempt. Generate keys in administration and distribute
one unused key to each participant along with the link. Key usage can be refreshed
in administration. Submit after the final step to mark the saved participation
complete. The administrative preview never saves responses or consumes keys.

## Persistence and timing

Names, normalized emails and used keys are linked to participations in PostgreSQL.
Answers and timing remain stored as steps are confirmed, including incomplete
participations. The database enforces unique emails and keys per questionnaire.
For route responses, `route_order[choice]` identifies `optimal` or `alternative`.
The research protocol and timing fields remain unchanged.

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

## Replacing the local schema

The current schema requires a fresh set of questionnaire tables. When replacing
an older local installation, stop both backend services and explicitly remove
only the old questionnaire tables once, then restart the services:

```sql
DROP TABLE IF EXISTS answers, participations, participation_keys, questions,
    scenarios, questionnaires;
```

This discards all old questionnaire data and responses. Initialization creates
the new tables; it does not perform migrations or automatically erase data.
Other database tables, simulation files and Docker volumes must be preserved.
