# Connected research workflows

Authorised by Ray on 31 October 2026, before native sync. This extends Research
and adds five optional modules: Protocol Runner, Sample Tracker, Equipment
Planner, Research Questions and Meeting Organiser.

## Data and boundaries

Experiments remain normal Markdown pages of type `experiment`. Each new module
stores its records as YAML in `Research/Protocols`, `Research/Runs`,
`Research/Samples`, `Research/Equipment`, `Research/Bookings`,
`Research/Questions` or `Research/Meetings`. IDs and wikilinks connect records;
the search index is only a derived view. Existing protocols, inventory, dataset
records and ordinary notes can be linked without migration.

Research exposes shared record and form helpers in `src/modules/research/api.ts`.
The five new modules declare their dependency on Research and use its public
helpers. Platform access continues exclusively through `src/core/api`.
Each module has its own manifest, tool view and file handlers. Switching off a
module removes its views and leaves every file intact.

## Behaviours to deliver

- An Experiment Hub gathers notes, protocols, runs, samples, questions, meetings,
  bookings, inventory and datasets through links, with editable experiment details.
- Protocol templates contain editable steps, offsets and timer lengths. A run
  keeps a copy of its steps and source version, records completion and deviations,
  and can export a dated checklist to an experiment for Tasks.
- Repeat runs reset completion, retain a link to the previous run and allow
  unfinished work to be carried forward. Previous runs remain available to compare.
- Changing run dates first previews affected steps and related bookings. Applying
  requires an explicit action. Changed files are checked again before saving.
- Samples keep source lineage, treatment, collection, storage and data links.
- Equipment records hold preparation and maintenance information. Booking overlap
  checks include the equipment identity and start/end times; alternatives are
  suggestions, never external bookings.
- Questions connect hypotheses, experiments, evidence, conclusions and next tests.
- Meetings connect agendas and decisions to experiments and questions. Explicit
  export turns follow-ups into checklist tasks on a linked experiment or daily page.

All forms use normal labels and link pickers. There are no new dependencies,
accounts or network calls. New modules are included in the Research pack; existing
vaults can enable them individually in Settings > Modules.

Automated checks cover persistence, malformed files, schedule review, conflicts,
lineage, repeat runs, module lifecycle and connected browser flows. Real tablet
and week-of-lab-work acceptance checks remain separate.

## Using the tools

In an existing vault, open **Settings > Modules** and enable the Research pack,
or choose the new modules separately. Protocol Runner also enables Lab notebook
and Lab tools for existing protocols and shared timers. Tools appear in the
sidebar and on Home when their modules are enabled.

1. Create or choose an experiment in **Experiment Hub**. Add its aim, conditions,
   protocol, materials, data links and conclusions through **Edit details**.
   **Write experiment notes** opens its normal page in the editor.
2. Create a template in **Protocol Runner**, with one instruction per line.
   Edit step offsets and timer lengths, then **Save steps**. Existing Lab notebook
   protocol pages can also be selected when starting a run.
3. Start a run and choose its experiment and start date. Save checked steps and
   deviations. Timers appear in the existing Timers widget. Repeat all steps or
   carry unfinished steps into a new run; **Compare with** displays the prior run.
4. Link samples and equipment reservations to the experiment or run. Parent
   samples and source stocks provide lineage; aliquots inherit their experiment,
   treatment and storage location.
5. Add questions, evidence and next tests in **Research Questions**. The next-test
   action creates an experiment linked back to the question.
6. Link a meeting to experiments and questions. Prepare its agenda from those
   records, record decisions, then explicitly create follow-up tasks.

The hub stages gather connected records; the full Connected records list also
shows other direct links. Run and sample connections are followed one level to
bring relevant bookings, protocols and source materials into the stage views.

## Schedule and recovery rules

Protocol runs copy their steps and version at creation. Later template edits do
not rewrite an existing run. Use **Review a date change** to inspect remaining
step dates, reservations linked to that run and its exported checklist. No files
change until **Apply reviewed changes**. Completed steps are excluded from the
proposed remaining-work list. Unrelated bookings and manually written tasks are
not moved. Reservations linked only to an experiment must be adjusted explicitly.

Exports are deliberate copies: the run's saved completion and its exported Tasks
checklist are separate records of work. Date review updates generated due dates
for unchecked exported tasks. Repeating a run starts with a fresh checklist;
original observations stay with the previous run.

Record editors reject stale files and retain their form when a save fails.
Snapshots are kept before updates. A failed multi-file schedule update attempts
to restore files already written, and does not overwrite newer external changes
during recovery. If storage failure prevents restoration, the error identifies
the records that need attention; recovery copies remain under the vault's
`.benchwork/snapshots` folder.
