# Teaching and Creative

Enable the **Teaching and Creative** pack in Settings > Modules, or enable
Teaching Studio, Study Arcade and Theme Studio separately. Everything works
locally. Disabling a module keeps its files.

## Build a lesson

Open Lesson Studio and create a lesson. Add text cards, a BenchWork note, images,
PDFs or PowerPoint material. Reorder or duplicate slides, set planned minutes and
write private speaker notes. Text cards can reveal one line at a time. The Pen
button adds vector annotations; Undo ink removes the last stroke. Removing a
slide from a sequence keeps its source material.

Lessons save automatically after edits, with a visible save/retry button. Study
sets use an explicit Save button. Both sessions retain edits while moving to
another BenchWork view and finish saving before their module or vault closes.
A failed save keeps the module and vault open for retry.

Imports are copied into unique folders under `Teaching/Assets`, with a 64 MB
source-file limit. A note becomes a plain-text slide snapshot linked to its
source path. PDF pages and imported images retain their own layout within a
16:9 stage. Changing an original does not change a previously imported lesson.

PowerPoint import requires **Windows with Microsoft PowerPoint installed**.
It opens a read-only copy with macros disabled, exports each slide to PNG and
extracts speaker notes into the private notes field. These are static snapshots:
slide animations, transitions, video and interactive objects do not carry over.
Imported lessons can then be viewed on the tablet. On other devices, import a
PDF instead. Import at most 1,000 pages/slides, with slide images below 10 MB.

## Present and rehearse

Presenter Desk shows the current slide, next slide, private notes and a talk
timer. Choose a display and open the audience screen. Use a second monitor or
projector in extended-display mode to keep the desk private. The audience is a
separate page receiving only public slide content, colours and annotations.
Speaker notes and private controls are never included in that message.

Arrow keys move slides, Space reveals a line or advances, and B toggles blackout
when focus is outside an input or button. Blackout clears public text, images
and annotations. Leaving the teaching view closes its audience window. A browser
preview uses a separate popup; the native desktop app supports monitor selection.
The tablet supports building and rehearsing but not a separate projector window.

Rehearsal Room records elapsed time by slide, pause/resume, revision bookmarks
and practice notes. Finish and save, then open past rehearsals to compare actual
timings with the lesson's targets. Moving away pauses the session; returning
lets you resume. There is no audio recording.

## Personal study

Study Arcade offers flashcards and multiple-choice questions with optional
images and source paths. Fill in a prompt and answer, or at least two choices
and a correct choice. Start an untimed round or choose a time limit. Flashcards
use self-rating; quizzes show the correct answer and your explanation. Results
record points, elapsed time and each response, including unfinished rounds.
Review missed questions immediately after a round. This is personal practice;
there are no audience phones, network sessions or projector quiz controls.

## Appearance profiles

Theme Studio captures the existing appearance settings in named personal,
teaching or presenting profiles. Choose a base theme, accent, fonts, density,
background dimming and optional stars or glow. Apply is explicit; selecting or
importing a profile only loads its preview. Profiles do not change automatically
when opening a tool.

Use your own background image (up to 4 MB) and ambient audio (up to 5.5 MB).
Audio starts only after pressing Preview sound or Start ambience. Workspace
audio pauses when the app is hidden. Motion respects system reduced-motion
settings. Profiles also capture the existing widget surface styling, page width,
paper pattern and other appearance settings.

Export creates a `.theme.json` file under `Teaching/Theme packs`. Share that
file, then use Import theme pack on another device. Images and audio are embedded
in the pack, so no external media path is required. Packs contain validated
settings only, with no custom scripts, CSS or remote media. Imports are limited
to 15 MB and require an explicit Apply or Save after previewing.

## Files and checks

Lesson definitions: `Teaching/Lessons/*.lesson.yaml`. Rehearsal history:
`Teaching/Rehearsals/*.rehearsal.yaml`. Study sets: `Teaching/Quizzes/*.quiz.yaml`.
Round history: `Teaching/Practice/*.practice.yaml`. Named theme profiles:
`.benchwork/modules/theme-studio/profiles.json`. Appearance applied to the app
is device-specific, like the existing appearance settings.

Automated checks cover public-only audience payloads, blackout, save failures,
in-flight imports, real Windows PowerPoint conversion, PDF slide rendering,
rehearsals, quiz scoring and theme pack import/export. A physical projector and
tablet pen acceptance pass remains a separate device check.
