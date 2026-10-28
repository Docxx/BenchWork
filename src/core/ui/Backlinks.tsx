import { useApp } from './AppStoreContext';

/**
 * "Linked from" at the foot of a page. Hidden until a page links here, so
 * people who never use links never see it.
 */
export function Backlinks() {
  const backlinks = useApp((s) => s.backlinks);
  if (backlinks.length === 0) return null;

  const count = backlinks.length;
  return (
    <section className="backlinks" aria-label="Linked from">
      <h2>
        Linked from {count} {count === 1 ? 'page' : 'pages'}
      </h2>
      <BacklinkList />
    </section>
  );
}

/** The pages linking to the open page, each with the line that links. */
export function BacklinkList() {
  const backlinks = useApp((s) => s.backlinks);
  const openPage = useApp((s) => s.openPage);
  return (
    <ul className="backlink-list">
      {backlinks.map((link) => (
        <li key={link.path}>
          <button type="button" className="backlink" onClick={() => void openPage(link.path)}>
            <span className="backlink-title">{link.title}</span>
            {link.location !== '' && <span className="backlink-location">{link.location}</span>}
            {link.context !== '' && <span className="backlink-context">{link.context}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
