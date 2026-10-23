import { formatSize } from '../files/fileKinds';
import { useApp } from './AppStoreContext';

/**
 * Asks what to do with a file over the size limit: link to it where it is,
 * or copy it into the vault anyway. Linking is first, as large data usually
 * stays on lab storage.
 */
export function AttachDialog() {
  const question = useApp((s) => s.attachQuestion);
  const answer = useApp((s) => s.answerAttach);
  if (question === null) return null;

  return (
    <div
      className="floating-dialog confirm"
      role="alertdialog"
      aria-labelledby="attach-title"
      aria-describedby="attach-text"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          answer(null);
        }
      }}
    >
      <h2 id="attach-title" className="dialog-title">
        {question.name}
      </h2>
      <p id="attach-text">
        This file is {formatSize(question.size)}, over the {String(question.limitMB)} MB limit for
        copying into the vault. Link to it where it is, or copy it in anyway?
      </p>
      {!question.located && (
        <p className="hint">
          To link to it, you will be asked to find it, as pasted and dropped files do not say where
          they are.
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          // A choice is needed now, so the usual one takes focus.
          autoFocus
          onClick={() => {
            answer('link');
          }}
        >
          {question.located ? 'Link to it' : 'Find it and link'}
        </button>
        <button
          type="button"
          onClick={() => {
            answer('copy');
          }}
        >
          Copy into vault
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            answer(null);
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
