# Standardized route questionnaire

## Protocol and administration

`route-study-v4` is a fixed research protocol for non-specialists in autonomous
navigation, prepared for a possible future evaluation; its current three-condition design is defined here.
It uses the six distinct scenarios prepared for the questionnaire.
Every scenario belongs to the questionnaire and must contain a successful
calculation, a valid map, two distinct routes and the cost justification and contrastive explanation.
At participation start, the six scenarios are shuffled using a random attempt
UUID and their order is stored in `participations.scenario_order`. The first
three are used for assessments with explanations; the remaining three are used
for predictions. The administrator does not assign scenarios to phases.
Use **Prepare six scenarios**, choose only the grid size and generate six maps
with the existing generator and its unchanged size profiles. The requested seeds
are randomly selected multiples of 42 from 42 to 4200, without reuse within a questionnaire.
One action prepares the maps sequentially because the pipeline permits only one
operation at a time. Other generation and solver settings are captured when
preparation starts and remain fixed; ISP is always monolithic with reduction
`NONE`. The simulation's individual, import, queue and benchmark workflows remain
available and unchanged in behavior.

Draw all six alternative routes manually before solving the batch. No automatic
alternative is prefilled. The existing drawing, undo, zoom and optimal-route
reference controls remain available; route colors and symbols follow the palette.
Every success is saved immediately with an editable generated title, original
map, routes, requested/effective seeds, generation attempt, effective configuration,
real solver output, explanations and interventions. Only a valid resolution
response with `result.success: false` and a solver status discards a candidate
and replaces it with a map using a new seed. Draw replacement routes and solve
again until six successes exist. Successful candidates are never recalculated.
A saving failure retains the solved result for an idempotent saving retry.

Network errors, API unavailability, HTTP errors and invalid resolution responses
pause the round without discarding the current map, manual route or remaining
candidates. **Retry pending scenarios** resumes that queue and never repeats
already saved successes. It also works when an earlier confirmed ISP failure has
left fewer than six candidates; missing positions are generated after the resumed
round completes. Drawings remain subject to the existing leave/reload warning.

`POST /api/questionnaires/{id}/scenario-solve` is a local administrative endpoint
accepting `map`, `user_path`, `start` and `goal`. It uses the saved preparation
configuration and the map's reserved seed, forcing monolithic ISP with reduction
`NONE` on the server. It returns the existing solver response envelope; the normal
simulation continues to use `/api/isp/solve`.

Questionnaire generation and resolution run under the existing exclusive pipeline
lock. Their temporary configuration is restored on success or exception, including
published module values, derived values, endpoints, the current output directory
and the runner state. Restoration uses exact snapshots rather than recalculating
size profiles. Saved questionnaire configurations and generated artifacts retain
their own effective settings; later normal simulations retain their previous state.

After six consecutive generation failures, preparation pauses with the last error.
Continue to generate the missing positions or return to the questionnaire. The
configuration and reserved seeds are persistent, including when generation fails after
seed reservation. Grid size is fixed once reserved; use another questionnaire to
choose another size. Unresolved maps and drawings remain in browser memory only.
Internal navigation warns before discarding them, and reload/close uses the
browser's native warning. Returning fills missing positions with new seeds;
completed scenarios remain stored. Closing the browser during an unresolved save
can lose a local result, but any committed scenario remains in the database.

Six successful scenarios are automatically linked to the study. If that final
step fails, **Retry study setup** saves the study without repeating generation or
resolution, including after reopening the questionnaire. Preview and activation
require six valid distinct scenarios. Preparation does not create participants,
responses or aggregate study results.

`PUT /api/questionnaires/{id}/protocol` accepts no request body. It validates and
uses the questionnaire's six saved scenarios in creation order, creating twenty
question records: six `route_scenario` records and fourteen Likert items. Retrying
with the same scenarios preserves question identifiers. The participant sequence
assigns each scenario its assessment or prediction role using the stored order.
Prompts, item order and scale bounds cannot be edited manually.
Activation requires a complete valid protocol and locks editing. Closing a study
rejects unfinished participations and new attempts; completed submissions can be
retried without creating another record.

The schema is for an empty database. No migrations, legacy question types or
legacy participation endpoints are provided. Database initialization never
silently drops or converts existing tables.

## Participation overview

Draft questionnaires show scenario preparation and review and activation in order.
Title and description can be changed under **Edit details**.
Active and closed questionnaires show a read-only title and description,
participation counts. Active questionnaires include key management;
closed questionnaires omit it entirely. Active studies also retain participant
access and closure controls. Editing remains prohibited after activation.

Use **View scenarios** to reveal the saved scenarios and maps without creation
or rename controls. **Hide scenarios** returns to the overview. Participant
preview remains available for all three groups; opening preview and scenario views
is mutually exclusive. Selecting another questionnaire returns to its overview.

The participation panel shows **Completed**, **In progress** and **Total started**.
It loads with the results snapshot when the overview opens. **Refresh results**
updates counts and analyses together, without automatic polling. **View results**
expands the charts in place; **Hide results** collapses them without another
request. Completed means final submission has set
`completed_at`; a participation with all steps answered but not yet submitted
still counts as in progress. Closed studies retain counts of incomplete attempts.
Loading is shown separately from a real zero, and errors can be retried locally.

`GET /api/questionnaires/{id}/participation-summary` is a local administrative
endpoint returning `{total, completed, in_progress}`. It uses `Cache-Control:
no-store`, returns 404 for an unknown questionnaire and exposes no participant
identities. No schema changes are required.

## Administrative study results

Active and closed questionnaires include an expandable **Study results** panel
beside the existing participation controls. It starts collapsed and uses a
single results request for both participation counts and response analyses.
The general counts are not duplicated in another panel. Completed counts for
all three conditions appear alongside the existing totals.

**Refresh results** explicitly reloads the whole snapshot. There is no polling
or refresh when expanding or collapsing the charts. Loading and initial request
failure are distinct from real zero counts. Errors offer **Try again**; a failed
refresh retains the previous snapshot and identifies it as previous results.
Selecting another questionnaire resets the results and expansion state.

`GET /api/questionnaires/{id}/results` is available only in the local
administrative API. It returns 404 for an unknown questionnaire and 409 for a
draft, with `Cache-Control: no-store`. The public participant API and its frontend
proxy do not expose this endpoint. The existing `participation-summary` endpoint
retains its `{total, completed, in_progress}` contract and shares the counting
logic with the results endpoint.

The response contains only:

- `participation`: `total`, `completed`, `in_progress`, and `completed_by_group`
  with `cost_based`, `contrastive_text` and `contrastive_visual` counts.
- `rating_items`: fourteen records with `item_id`, `prompt`, `source_scale`,
  `source_item_number`, `source`, `topic` and `groups`. Each group contains a
  five-element `distribution` of response counts for ratings 1 through 5,
  `responses` and `missing`.
- `predictions`: one aggregate per group with `correct`, `proportion`,
  `responses`, `participants` and `missing`; `confidence` adds its `mean` to
  its own response, participant and missing counts; `decision_time` adds
  `median_seconds` to its own counts.

All queries are restricted to the selected questionnaire. Counts and answers
are read from one consistent, read-only transaction snapshot. Only scalar
answer fields and the metadata needed to distinguish phases are queried; maps,
credentials and free-text answers are not loaded for analysis. Internal IDs used
to count distinct contributing participants are never returned. No names,
emails, individual keys, participant IDs, attempt UUIDs or free-text answers
appear in the results payload or panel. Results requests never modify existing
records or the database schema.

### Inclusion and denominators

Participation totals include all started attempts. A participation is completed
only when `completed_at` is non-null; confirming every step without submitting
still counts as in progress. All response analyses include completed
participations only. In-progress answers and drafts are excluded, including in
closed questionnaires.

For each adapted rating item and group, valid responses are integers from 1 to 5. The bar
and displayed percentages use the number of valid responses to that particular
item in that group as the denominator. `missing` is the group's completed count
minus the valid response count for the item, including absent or invalid values.
All fourteen items identify their source scale, original item number, topic and
adapted text.
No overall score, source-scale score or thematic-group score is calculated.

A route answer belongs to prediction only if its scenario is one of the last
three IDs in that participation's stored `scenario_order`. The order must have
six distinct positive integer IDs matching the questionnaire's selected pool.
An invalid order prevents classification of prediction answers; the participant
remains in participation counts and any valid rating responses remain eligible.
Question position alone cannot identify prediction because the scenario pool is
randomized independently for each participation.

An accuracy observation requires an integer `choice` of 0 or 1 and a stored
`route_order` equal to either `["optimal", "alternative"]` or
`["alternative", "optimal"]`. It is correct when `route_order[choice]` is
`"optimal"`. Thus neither A nor B is assumed to be optimal. Missing or invalid
route order is excluded without reconstructing it from the UUID.

The panel labels one measure **Predictive accuracy / alignment with the system’s choice**. Both names refer to the same proportion, rather than separate metrics.
The proportion is `correct / responses` over valid prediction choices within
the group. For example, four matches among six valid predictions give 66.7%.
`participants` counts completed participants contributing at least one valid
observation, rather than assuming that all completed participants contributed
three valid observations.

Prediction confidence is the arithmetic mean of integer values from 0 to 100.
Zero is a valid confidence value. Decision time is the median of nonnegative
integer `decision_visible_duration_ms` values, converted to seconds by dividing
by 1,000. Zero is also a valid recorded duration. No elapsed wall-clock time,
reading duration or other timing field substitutes for missing decision time.
This interval runs from scenario presentation to **Confirm route**, excluding
confidence, justification, hidden-tab intervals and time away between visits.

Accuracy, confidence and decision time are validated independently. A missing
confidence does not remove a valid accuracy observation or decision time.
Each metric reports its own valid response and distinct participant counts.
For predictions, `missing` is three times the group's completed count minus
that metric's valid response count. For example, with two completed participants
and five valid confidence values, confidence uses five observations and reports
one missing or invalid observation out of six expected responses.

Empty denominators produce `null` for proportions, means and medians. The UI
shows **No valid responses**, not a fabricated 0% or zero average. Rating response
counts remain zero when no valid responses exist; percentages are omitted.
Only display formatting rounds values; the API retains unrounded aggregates.

### Interpretation and presentation

The adapted questionnaire uses three segmented bars per item, a labeled 1–5 legend and visible
counts and percentages. Prediction proportion, confidence and median time use
simple group comparison bars with explicit values, units and denominators.
Figures can receive keyboard focus and their data are available as text without
hovering or distinguishing colors. The panel wraps on smaller screens and adds
no charting dependency.

These results are descriptive, including with very small samples. Sample sizes
must accompany interpretation; the panel applies no significance tests,
confidence intervals or causal claims. Confidence means and time medians pool
valid responses rather than first averaging each participant's three responses.
The three predictions from a participant are repeated observations, not three
independent participants. Groups can also receive different scenario mixes
because of participant-level randomization; the aggregates are not adjusted for
scenario difficulty.

The custom instrument has not been psychometrically validated and is not a
full administration of any source scale. Prediction matches are
not Policy Divergence, and initial route assessments do not constitute a
pre-intervention prediction baseline. Self-reported confidence, decision time
and open responses cannot establish objective comprehension or causal
improvement. Decision time is not pure reading time and does not independently
measure attention. The planned inferential analyses described in section 4.3 of
`refs/tcc_01.pdf` are outside this descriptive panel.

## Participation keys

Active questionnaires show a compact **Participation keys** section.
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

## Block assignment and participation codes

New participations are randomized in blocks of three per questionnaire. Each block
contains one assignment for each condition in a uniformly shuffled order. Its
remaining assignments are persisted, and a new block is shuffled only when the
previous one has been consumed. Questionnaire row locking serializes starts;
block consumption, random code allocation and insertion commit in one transaction.
Rejected starts roll back the assignment. Resume never consumes a block position
or allocates another code. Incomplete attempts retain their assignment, so balance
applies to started participations rather than completed submissions.

Each participation receives a random unused string from `000` through `999`,
unique within that questionnaire and stable for every export. The database checks
three digits and uniqueness. The capacity is 1,000 started participations per
questionnaire; exhausted codes produce a clear 409, while existing attempts can
resume. At most 1,000 individual keys can be issued for the questionnaire, and a
batch exceeding the remaining capacity is rejected without partial creation.

## Completed-response CSV

**Export completed responses (CSV)** downloads
`GET /api/questionnaires/{id}/responses.csv` from the local administrative API.
It is available for active or closed questionnaires, uses a consistent read-only
snapshot and `Cache-Control: no-store`, and is absent from the public router.
The UTF-8 file has a BOM, comma-separated fields and standard CSV quoting.
No completed participations produces only a header, never example rows.

Each completed participation contributes six scenario rows and fourteen Likert
rows. Columns include its three-digit code, questionnaire and question identifiers,
group, phase, step position, scenario identifier, scenario position across the six
and position within its phase. `route_assessment` identifies the first three choices;
`route_prediction` identifies the three predictions; `likert` identifies rating items.
Scenario rows contain requested/effective seeds, the stored A/B ordering, route
identities and coordinate paths as JSON, chosen route and identity, confidence,
initial reason and the separate post-explanation reason. Likert rows contain item
identifier, adapted wording, source scale/item and rating. Inapplicable fields are
empty. All existing recorded durations, selection-change indicators, confirmation
and explanation timestamps and participation start/completion timestamps are included.
Durations use milliseconds and retain the existing visible-time definitions.

Names, emails, individual keys, attempt UUIDs and internal participation IDs are
excluded. Free-text answers are preserved and can contain information typed by the
participant; removing identity columns does not anonymize arbitrary prose.
Spreadsheet formula prefixes in text fields are escaped with a leading apostrophe.
Import `participation_code` as text in spreadsheet software to retain leading zeros.
Export and result viewing never allocate codes or change stored responses.

## Participant sequence

There are twenty-three content steps and a final submission action:

1. For each of the first three scenarios, participants select the route they
   consider faster. They may change it until **Confirm route**. Confirmation
   locks the route and then reveals integer confidence from 0 to 100 and a
   justification of 20 to 1,000 characters, excluding surrounding whitespace.
   No route or confidence is preselected. The full answer is stored as
   `{choice, confidence, reason}`; `choice` is the displayed route index
   (0 for A, 1 for B). The route confirmation is an internal phase, not an
   additional content step.
2. After each assessment, its explanation is shown on a separate step.
   `cost_based` receives `cost_baseline_text`. `contrastive_text` receives
   `explanation_text`. `contrastive_visual` receives exactly the same
   `explanation_text` plus the contrastive map with semantic interventions.
   The textual conditions do not receive intervention data in the step payload.
   The explanation compares the saved optimal/alternative routes regardless of
   the participant's choice. On this same step, participants must answer:
   **After reading the explanation, which characteristics explain the system’s
   route choice?** The response must contain 20 to 1,000 characters after
   trimming and is stored separately as `post_explanation_reason`. The original
   pre-explanation justification is preserved.
3. Participants rate fourteen required statements about the explanations on the
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
initial or post-explanation reason, rating-item response and accumulated timing.

## Adapted route explanation questionnaire

The displayed title is **Adapted route explanation questionnaire**. These fourteen
items replace the previous eight-item ESS adaptation. They appear in the fixed
order selected in [questionarios-avaliacao.md](questionarios-avaliacao.md), after
the three explanations and before the prediction phase. That document provides
the full original/adapted wording comparison and the five thematic groups.

| Position | Source and persisted ID | Adapted statement |
| --- | --- | --- |
| 1 | ESS 1 (`ess_1`) | From the explanations, I understand how the route-planning system works. |
| 2 | SCS 5 (`scs_5`) | I found the explanations helped me understand cause-and-effect relationships in the system’s route choices. |
| 3 | xHIS 10 (`xhis_10`) | I understand why the system used specific information in its explanations. |
| 4 | ESS 3 (`ess_3`) | The explanations of how the route-planning system works have sufficient detail. |
| 5 | ESS 4 (`ess_4`) | The explanations of how the route-planning system works seem complete. |
| 6 | SCS 7 (`scs_7`) | I did not find inconsistencies between explanations. |
| 7 | ESS 2 (`ess_2`) | The explanations of how the route-planning system works are satisfying. |
| 8 | xHIS 25 (`xhis_25`) | The explanations were useful. |
| 9 | xHIS 18 (`xhis_18`) | The explanations were an important resource for me to answer the questions about the system’s route choices. |
| 10 | ESS 5 (`ess_5`) | The explanations of how the route-planning system works tell me how to use it. |
| 11 | SCS 6 (`scs_6`) | I was able to use the explanations with my existing knowledge. |
| 12 | xHIS 12 (`xhis_12`) | I could have applied the system’s reasoning to new route-planning problems, even if it had not given me suggestions. |
| 13 | ESS 7 (`ess_7`) | The explanations of the route-planning system show me how accurate it is. |
| 14 | ESS 8 (`ess_8`) | The explanations let me judge when I should trust and not trust the route-planning system. |

The sources are Hoffman et al., Appendix C (`refs/eval_hoffman2019.pdf`);
Holzinger et al., Section 5 (`refs/eval_holzinger2020.pdf`); and Silva et al.,
Section 4.9 (`refs/eval_silva2022.pdf`). Source scale, original item number,
reference and topic are saved in each question's configuration alongside
`item_id`, `min: 1` and `max: 5`. Presentation position is distinct from the
original item number: ESS 7 is the thirteenth item in this custom instrument.
Step serialization includes `item_number`, `item_total`, the custom `instrument`
title and the persisted origin metadata. The results API uses `rating_items`,
not the former ESS-only field.

Response labels are 1: Strongly disagree; 2: Somewhat disagree; 3: Neither agree
nor disagree; 4: Somewhat agree; 5: Strongly agree. Every item is required, no
value is preselected, and booleans, fractions or out-of-range values are rejected.
ESS and SCS originally use five points; xHIS uses seven. Applying five points to
all selected items deliberately changes the xHIS response scale.

Selection retains items pertinent to the study while reducing repetition and
response burden. ESS 6 is omitted because goal usefulness overlaps the selected
xHIS usefulness and question-support items. Changes to wording are limited to
the route-planning referent, the three explanations collectively and the task
context. xHIS 18 concerns the questions answered after disclosure, not proof of
help on earlier choices. xHIS 12 is hypothetical self-assessment, not measured
transfer performance. Some conceptual overlap remains; this is a pragmatic
selection, not a validated scale-reduction procedure.

This is a custom adapted instrument, not a full administration or validated
version of ESS, SCS or xHIS. Its thematic groups are organizational, not validated
subscales. No overall score, original-scale score or topic score is calculated.
SCS 7 expresses perceived consistency when endorsed, without reverse scoring.
Raw ratings and descriptive distributions do not establish objective
comprehension, actual planner accuracy or causal improvement.

The reference set informs the implementation as follows:

- Hoffman, *Metrics for Explainable AI: Challenges and Prospects*, Appendix C:
  seven selected ESS items; satisfaction differs from mental models and performance.
- Korpan, *Evaluation of a Robot Navigator's Explanations*: a post-scenario survey
  and prediction of behavior in new scenarios; detailed explanations can affect
  perceived understanding differently from immediate comprehensibility.
- Zou and Borst, *Algorithmic Transparency in Path Planning*: distinguish tested
  understanding, self-rated confidence (0 to 100) and response time.
- Silva et al., *Evaluating the Objective and Subjective Impacts of xAI on
  Human-Agent Interaction*: source of four selected xHIS items; retain separate subjective and objective measures.
- Holzinger et al., *The System Causability Scale*: causal understanding is
  contextual. Three SCS items are selected without calculating an SCS score.
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
  explanation values may omit required fields; rating-item values may be null.
  The response returns the new `draft_revision`. Exact retries are idempotent.
- `POST /api/participate/{token}/steps/{step}/confirm` takes the same envelope
  with a complete `progress` snapshot. Route assessments require
  `{choice, confidence, reason}`; predictions require `{choice, confidence}`;
  explanations require `{reason}`; rating-item values are integers from 1 to 5.
  Route confirmation is required for route answers. Explanation reasons are
  stored separately from the prior assessment value.
- Confirmation saves the response and timings, advances the step, increments
  the revision and clears the draft in one transaction. Repeating an identical
  confirmed answer returns current progress without modifying saved timing.
  A different confirmed answer, future step or stale revision returns 409.
  After route confirmation, drafts cannot alter the choice or selection times.
- `POST /api/participate/{token}/submit` accepts only `submission_key` and succeeds
  once all content steps are confirmed. Identical retries are idempotent.
- `GET /api/questionnaires/{id}/preview?group=cost_based&step=0&submission_key={uuid}`
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

The v4 schema requires a fresh set of questionnaire tables, including preparation configuration and seed cursor, remaining block assignments,
three group identifiers, stable export codes, the `current_step` limit of 23 and
the `route-study-v4` default. Startup rejects an older schema before changing it. No migration or
compatibility with the previous instrument is provided. Existing data is never
automatically converted, deleted or relabeled as v4. The following replacement
procedure is manual and destructive; it is not run by this change.

When replacing an older local installation, stop both backend services and explicitly remove
only the old questionnaire tables once, then restart the services:

```sql
DROP TABLE IF EXISTS answers, participations, participation_keys, questions,
    scenarios, scenario_seed_reservations, questionnaires;
```

This discards all old questionnaire data and responses. Initialization creates
the new tables; it does not perform migrations or automatically erase data.
Other database tables, simulation files and Docker volumes must be preserved.
