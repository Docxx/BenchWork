import { Bug, Download, MessageSquarePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  APP_VERSION,
  FEEDBACK_EMAIL,
  PREVIEW_BUILD,
  mailDraft,
  newFeedback,
  reportSubject,
  reportText,
  type FeedbackDraft,
} from '../feedback/report';
import { useApp } from './AppStoreContext';
import './feedback.css';

/** Preview tools are local and quiet until the tester explicitly opens them. */
export function FeedbackTools() {
  const visible = useApp((s) => s.settings.previewBarVisible);
  const show = useApp((s) => s.feedbackOpen);
  const setShow = useApp((s) => s.setFeedbackOpen);
  const setVisible = useApp((s) => s.setPreviewBarVisible);
  const environment = useApp((s) => s.feedbackEnvironment);
  const email = useApp((s) => s.openFeedbackEmail);
  const updates = useApp((s) => s.openLatestInstaller);
  const [draft, setDraft] = useState(newFeedback);
  const [includeDetails, setIncludeDetails] = useState(true);
  const [message, setMessage] = useState('');
  const [barError, setBarError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLTextAreaElement>(null);
  const report = reportText(draft, includeDetails ? environment : null);
  const ready = draft.title.trim() !== '' && draft.description.trim() !== '';
  const barVisible = PREVIEW_BUILD && visible;
  useEffect(() => {
    document.documentElement.dataset['previewBar'] = barVisible ? 'on' : 'off';
    return () => {
      delete document.documentElement.dataset['previewBar'];
    };
  }, [barVisible]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (show && !element.open) element.showModal();
    if (!show && element.open) element.close();
  }, [show]);
  if (!PREVIEW_BUILD) return null;
  function edit(value: Partial<FeedbackDraft>) {
    setDraft((d) => ({ ...d, ...value }));
    setMessage('');
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(report);
      setMessage('Report copied. You can paste it into your email app.');
    } catch {
      preview.current?.focus();
      preview.current?.select();
      setMessage('Select and copy the report below, then email it to ' + FEEDBACK_EMAIL + '.');
    }
  }
  return (
    <>
      {barVisible && (
        <aside className="preview-toolbar" aria-label="Development preview tools">
          <span className="preview-label">
            Preview <small>v{APP_VERSION}</small>
          </span>
          <div>
            <button
              className="feedback-primary"
              onClick={() => {
                setShow(true);
              }}
            >
              <Bug size={16} aria-hidden />
              Feedback &amp; bugs
            </button>
            <button
              onClick={() => {
                void updates().catch((e: unknown) => {
                  setBarError(String(e));
                });
              }}
            >
              <Download size={16} aria-hidden />
              <span>Latest installer</span>
            </button>
            <button
              className="preview-hide"
              aria-label="Hide preview toolbar"
              title="Hide this toolbar; restore it in Settings > General"
              onClick={() => {
                void setVisible(false);
              }}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          {barError && <span role="alert">{barError}</span>}
        </aside>
      )}
      <dialog
        ref={dialog}
        className="feedback-dialog"
        aria-labelledby="feedback-title"
        onCancel={(e) => {
          e.preventDefault();
          setShow(false);
        }}
      >
        <header>
          <div>
            <span className="feedback-eyebrow">HELP SHAPE BENCHWORK</span>
            <h2 id="feedback-title">Feedback &amp; bug reports</h2>
          </div>
          <button
            aria-label="Close feedback"
            className="quiet"
            onClick={() => {
              setShow(false);
            }}
          >
            <X size={20} />
          </button>
        </header>
        <p className="feedback-intro">
          Something broken, a missing feature or an idea? Tell Ray what would make BenchWork better.
        </p>
        <div className="feedback-types" role="group" aria-label="Report type">
          {(['bug', 'idea', 'feedback'] as const).map((kind) => (
            <button
              key={kind}
              aria-pressed={draft.kind === kind}
              onClick={() => {
                edit({ kind });
              }}
            >
              {kind === 'bug' ? <Bug size={16} /> : <MessageSquarePlus size={16} />}
              {kind === 'bug' ? 'Bug report' : kind === 'idea' ? 'Suggestion' : 'Other feedback'}
            </button>
          ))}
        </div>
        <div className="feedback-fields">
          <label>
            Title
            <input
              autoFocus
              maxLength={120}
              value={draft.title}
              placeholder={
                draft.kind === 'bug'
                  ? 'A short description of the problem'
                  : 'Your idea in a few words'
              }
              onChange={(e) => {
                edit({ title: e.target.value });
              }}
            />
          </label>
          <label>
            Area
            <select
              value={draft.area}
              onChange={(e) => {
                edit({ area: e.target.value });
              }}
            >
              {[
                'General',
                'Home and calendar',
                'Notes and handwriting',
                'Files and PDFs',
                'Sync',
                'Research tools',
                'Teaching tools',
                'Appearance',
                'Installation and updates',
                'Other',
              ].map((area) => (
                <option key={area}>{area}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {draft.kind === 'bug' ? 'What happened?' : 'Tell us more'}
          <textarea
            rows={4}
            maxLength={6000}
            value={draft.description}
            onChange={(e) => {
              edit({ description: e.target.value });
            }}
          />
        </label>
        {draft.kind === 'bug' && (
          <div className="feedback-fields">
            <label>
              Steps to reproduce <small>Optional</small>
              <textarea
                rows={3}
                maxLength={4000}
                value={draft.steps}
                onChange={(e) => {
                  edit({ steps: e.target.value });
                }}
              />
            </label>
            <label>
              What should have happened? <small>Optional</small>
              <textarea
                rows={3}
                maxLength={2000}
                value={draft.expected}
                onChange={(e) => {
                  edit({ expected: e.target.value });
                }}
              />
            </label>
          </div>
        )}
        <label className="feedback-check">
          <input
            type="checkbox"
            checked={includeDetails}
            onChange={(e) => {
              setIncludeDetails(e.target.checked);
            }}
          />
          Include app version, build and device type
        </label>
        <p className="feedback-privacy">
          BenchWork does not automatically add notes, vault paths, email accounts, logs or
          screenshots. Review the report before opening a draft to <strong>{FEEDBACK_EMAIL}</strong>
          . You can attach a screenshot yourself in your email app.
        </p>
        <details className="feedback-report" open>
          <summary>Report preview</summary>
          <textarea
            ref={preview}
            aria-label="Report preview"
            readOnly
            rows={7}
            value={report}
            onFocus={(e) => {
              e.target.select();
            }}
          />
        </details>
        {message && (
          <p className="feedback-message" role="status">
            {message}
          </p>
        )}
        <footer>
          <button
            disabled={!ready || busy}
            className="feedback-primary"
            onClick={() => {
              const prepared = mailDraft(reportSubject(draft), report);
              setBusy(true);
              setMessage('');
              void email(prepared.subject, prepared.body)
                .then(() => {
                  setMessage(
                    prepared.needsPaste
                      ? 'Email draft opened. Use Copy report, then paste it into the draft before sending.'
                      : 'Email draft opened. Review it and send it from your email app. Nothing was sent automatically.',
                  );
                })
                .catch((e: unknown) => {
                  setMessage(
                    `${String(e)} You can copy the report below and email it to ${FEEDBACK_EMAIL}.`,
                  );
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            Open email draft
          </button>
          <button
            disabled={!ready}
            onClick={() => {
              void copy();
            }}
          >
            Copy report
          </button>
          <button
            className="quiet"
            onClick={() => {
              setShow(false);
            }}
          >
            Close
          </button>
        </footer>
        <p className="feedback-draft-note">
          Closing this window keeps your draft until you close BenchWork.
        </p>
      </dialog>
    </>
  );
}
