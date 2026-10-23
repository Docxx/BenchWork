import { useEffect, useState } from 'react';
import { formatSize } from '../files/fileKinds';
import type { LinkCheck, LinkRecord } from '../files/linkedFiles';
import { useApp } from './AppStoreContext';

const CHECK_TEXT: Record<LinkCheck['state'], string> = {
  same: 'The file is the same as when it was linked.',
  changed: 'The file has changed since it was linked.',
  missing:
    'The file is not at this path any more. It may have been moved, or its drive is not connected.',
  unreadable: 'The file could not be read.',
  unchecked: 'This link has no checksum to compare with.',
};

/**
 * A large file kept outside the vault: where it is, its size and checksum,
 * and a check that it has not changed. The file itself is never changed.
 */
export function LinkedFileView({ path }: { path: string }) {
  const readLinkRecord = useApp((s) => s.readLinkRecord);
  const checkLinkedFile = useApp((s) => s.checkLinkedFile);
  const [record, setRecord] = useState<LinkRecord | null | undefined>(undefined);
  const [check, setCheck] = useState<LinkCheck | 'checking' | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    readLinkRecord(path).then(
      (r) => {
        if (live) setRecord(r);
      },
      () => {
        if (live) setRecord(null);
      },
    );
    return () => {
      live = false;
    };
  }, [path, readLinkRecord]);

  if (record === undefined) return <p className="hint">Loading…</p>;
  if (record === null) {
    return <p className="hint">This link could not be read, so it is left as it is.</p>;
  }

  return (
    <div className="linked-file">
      <p className="hint">
        This file is linked, not copied into the vault, so it stays where it is.
      </p>
      <dl className="record-values">
        <div className="record-value">
          <dt>Location</dt>
          <dd className="linked-path">{record.path}</dd>
        </div>
        {record.size !== null && (
          <div className="record-value">
            <dt>Size</dt>
            <dd>{formatSize(record.size)}</dd>
          </div>
        )}
        {record.sha256 !== null && (
          <div className="record-value">
            <dt>SHA-256</dt>
            <dd className="checksum" title={record.sha256}>
              {record.sha256}
            </dd>
          </div>
        )}
        {record.added !== null && (
          <div className="record-value">
            <dt>Linked</dt>
            <dd>{record.added.slice(0, 10)}</dd>
          </div>
        )}
      </dl>
      <div className="actions">
        <button
          type="button"
          disabled={check === 'checking'}
          onClick={() => {
            setCheck('checking');
            void checkLinkedFile(record).then(setCheck);
          }}
        >
          {check === 'checking' ? 'Checking…' : 'Check file'}
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            void navigator.clipboard.writeText(record.path).then(
              () => {
                setCopied(true);
              },
              () => undefined,
            );
          }}
        >
          {copied ? 'Copied' : 'Copy location'}
        </button>
      </div>
      {check !== null && check !== 'checking' && (
        <p className={`link-check ${check.state}`} role="status">
          {CHECK_TEXT[check.state]}
          {check.state === 'unreadable' ? ` ${check.message}` : ''}
        </p>
      )}
    </div>
  );
}
