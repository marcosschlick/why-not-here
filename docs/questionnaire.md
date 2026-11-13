# Standardized route questionnaire

## Protocol and administration

`route-study-v2` is a fixed research protocol for non-specialists in autonomous
navigation, following the experimental design in `refs/tcc_01.pdf`.
It uses a pool of six distinct saved scenarios selected by the administrator.
Every scenario belongs to the questionnaire and must contain a successful
calculation, a valid map, two distinct routes and both group explanations.
At participation start, the six scenarios are shuffled using a random attempt
UUID and their order is stored in `participations.scenario_order`. The first
three are used for assessments with explanations; the remaining three are used
for predictions. The administrator does not assign scenarios to phases.
Generate maps individually or add or import configurations into a queue, then
review routes, calculate results and name saved scenarios using the existing
simulation workflow. Automatic batch map generation is unavailable in this mode.

`PUT /api/questionnaires/{id}/protocol` accepts:

```json
{
  "scenario_ids": [1, 2, 3, 4, 5, 6]
}
```

These numbers are example identifiers. Saving creates fourteen question records:
six `route_scenario` records and eight Likert items. The participant sequence
assigns each scenario its assessment or prediction role using the stored order.
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

1. For each of the first three scenarios, participants select the route they
   consider faster. They may change it until **Confirm route**. Confirmation
   locks the route and then reveals integer confidence from 0 to 100 and a
   justification of 20 to 1,000 characters, excluding surrounding whitespace.
   No route or confidence is preselected. The full answer is stored as
   `{choice, confidence, reason}`; `choice` is the displayed route index
   (0 for A, 1 for B). The route confirmation is an internal phase, not an
   additional content step.
2. After each assessment, its explanation is shown on a separate step.
   Control participants receive `cost_baseline_text`. Experimental participants
   receive `explanation_text` and the contrastive map with semantic interventions.
   The explanation compares the saved optimal/alternative routes regardless of
   the participant's choice. On this same step, participants must answer:
   **After reading the explanation, which characteristics explain the system’s
   route choice?** The response must contain 20 to 1,000 characters after
   trimming and is stored separately as `post_explanation_reason`. The original
   pre-explanation justification is preserved.
3. Participants rate eight required statements about the explanations on the
   same five-point scale.
4. In three unseen scenarios, participants predict which route the system would
   select. They can change the route until **Confirm route**, then must select
   integer confidence from 0 to 100 in that prediction. Prediction answers are
   `{choice, confidence}`. No cost, explanation, route identity or correctness
   feedback is delivered, including after confirmation.
5. Participants submit to mark the already saved answers complete.

The server permits only the current step. Confirmed steps cannot be edited or
revisited. Closing a questionnaire rejects unfinished participations; completed
submissions remain idempotent.

Before starting or resuming, participants enter their individual key, original
name and email at the same `/questionnaire` address. Names are trimmed and must
match the original spelling and case; emails are trimmed and lowercased. Each
key and email can belong to only one participation per questionnaire. The key
is reserved at the first start, but can authenticate that same participation
again. No email ownership verification is performed.

Retaking the form with matching details returns the original attempt UUID,
group, scenario order, current step and saved draft. This works after closing
the tab, clearing session storage, or opening another browser. Reloading the
original tab also resumes automatically. A recovery never creates a second
participation or repeats group or scenario assignment. A completed participation
returns its completion screen.

A/B route order is deterministic per original attempt UUID and question, and is
stored with confirmed route answers. Identical styling is used before disclosure.
Draft fields include a selected route, route confirmation state, confidence,
initial or post-explanation reason, ESS rating and accumulated timing.

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
  of factual grounding. Separate open responses before and after disclosure
  capture initial reasoning and reported characteristics of the system's choice;
  this pairing alone does not establish causal improvement.
- Chen et al., *Towards Transparent Robotic Planning via Contrastive
  Explanations*: explanation content and reading time can have different effects;
  do not assume shorter explanations necessarily improve every outcome.

## APIs and preview

- `POST /api/questionnaires/{id}/participation-keys` accepts `quantity` (an integer
  from 1 to 1,000) and generates individual keys for a draft or active study.
  `GET` on the same endpoint lists `key`, `created_at` and `used`. These are local
  administrative endpoints; keys are not exposed through the participant API.
- `POST /api/participate/start` accepts `name`, `email`, `key` and a random
  browser-generated `submission_key` UUID. An unused globally unique key
  identifies its study and atomically reserves the key and email. A used key
  with the same normalized name/email recovers its original participation,
  ignoring the newly supplied UUID. The response includes current public state,
  the original `submission_key` and an internal `access_token`. Credentials never
  appear in the participant URL. Names are nonempty and limited to 200
  characters; valid emails are limited to 254. Invalid keys or mismatched
  recovery details return 401; duplicate email/session returns 409; closed
  unfinished studies return 410. Validation failures do not consume keys.
- `GET /api/participate/{token}?submission_key={uuid}` returns questionnaire
  details, `current_step`, `total_steps`, the current `step`, completion status,
  `draft` and `draft_revision`. It never creates a participation or returns
  another participant's state. Public state uses `Cache-Control: no-store`.
- `PUT /api/participate/{token}/steps/{step}/draft` accepts `submission_key`,
  `revision` and `progress`. A progress object contains `value`,
  `visible_duration_ms`, `route_confirmed`,
  `first_selection_visible_duration_ms`, `final_selection_visible_duration_ms`,
  `decision_visible_duration_ms` and `choice_changed`. Durations are nonnegative
  integer milliseconds; selection durations are null until selection occurs,
  and decision duration is null until route confirmation. Partial route and
  explanation values may omit required fields; ESS values may be null.
  The response returns the new `draft_revision`. Exact retries are idempotent.
- `POST /api/participate/{token}/steps/{step}/confirm` takes the same envelope
  with a complete `progress` snapshot. Route assessments require
  `{choice, confidence, reason}`; predictions require `{choice, confidence}`;
  explanations require `{reason}`; ESS values are integers from 1 to 5.
  Route confirmation is required for route answers. Explanation reasons are
  stored separately from the prior assessment value.
- Confirmation saves the response and timings, advances the step, increments
  the revision and clears the draft in one transaction. Repeating an identical
  confirmed answer returns current progress without modifying saved timing.
  A different confirmed answer, future step or stale revision returns 409.
  After route confirmation, drafts cannot alter the choice or selection times.
- `POST /api/participate/{token}/submit` accepts only `submission_key` and succeeds
  once all content steps are confirmed. Identical retries are idempotent.
- `GET /api/questionnaires/{id}/preview?group=control&step=0&submission_key={uuid}`
  uses the same step construction and serializer. Its order is reproducible for
  the preview UUID and shared between group previews. Preview creates no
  participations, drafts or answers and consumes no individual key.

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
Confirmed steps and partial progress are saved in PostgreSQL. Participants can
resume from the same address using the original name, email and key. Generate
keys in administration and distribute
one unused key to each participant along with the link. Key usage can be refreshed
in administration. Submit after the final step to mark the saved participation
complete. The administrative preview never saves responses or consumes keys.

## Persistence and timing

PostgreSQL links the name, normalized email and individual key to one
participation. `scenario_order` stores the six scenario IDs in presentation order.
`draft` stores the current partial progress and `draft_revision` prevents stale
updates. Confirmed answers remain stored even if the participation is incomplete.
For route answers, `route_order[choice]` identifies `optimal` or `alternative`.

| Field | Meaning |
| --- | --- |
| started_at | Server time of the first participation start; unchanged on recovery |
| completed_at | Server time of final submission |
| confirmed_at | Server time when the full response was saved |
| explanation_completed_at | Server time when the post-explanation response was confirmed |
| post_explanation_reason | Required response after disclosure, separate from the original reason |
| visible_duration_ms | Total foreground exposure and response time, including the explanation step for assessments |
| first_selection_visible_duration_ms | Active time from scenario presentation to the first route selection |
| final_selection_visible_duration_ms | Active time from presentation to the last effective route selection before route confirmation |
| choice_changed | Whether any route change occurred, including A → B → A |
| decision_visible_duration_ms | Active time from presentation until Confirm route; excludes confidence and justification |
| explanation_visible_duration_ms | Foreground time for the explanation step, including both reading and the post-explanation response |

Selection metrics are null for non-route questions. With no change, first and
final selection times are equal. Selecting an already selected route does not
change either metric. Waiting before confirming the selected route affects the
decision duration but not final selection time. Confidence and justification
only appear after route confirmation, so neither affects selection or decision
metrics. Explanation duration must not be interpreted as pure reading time.

Browser durations use `performance.now()` and start after the route maps are
drawn and their scenario is presented in the visible tab. Other steps start
after presentation. Hidden-tab intervals, blocking request waits, initial map
loading and time away between visits are excluded. Resuming restores accumulated
milliseconds and starts a fresh foreground interval; wall-clock timestamps are
never subtracted to calculate response times. These client measurements do not
independently verify attention.

Field changes are autosaved after 500 ms without another change. Active timing
is checkpointed every second, with another checkpoint on hiding or leaving the
page. Background saves do not block interaction or pause viewing time. A local
session cache assists reloads while its revision matches the server. Reopening
in a different tab or browser uses the server draft. No credentials are stored
in the draft cache.

Save failures retain the fields and show retry feedback. Writes are serialized,
and ambiguous network failures retry the same snapshot before later updates.
A stale revision blocks further editing and offers **Reload saved progress**;
the server's newer state is authoritative. Normal step confirmation flushes
partial progress before sending the complete response. Leaving during an
in-flight request, an abrupt process termination or loss of connectivity may
lose changes that were not yet synchronized; recovery restores the last saved
checkpoint without counting the absence.

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
