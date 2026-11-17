import { act, fireEvent, render, screen } from '@testing-library/react';
import { NoteText, NoteTextEditor, noteWords, plainTextToMarkdown } from './NoteText';

describe('Formatted notes', () => {
  it('show bold, italic, lists and links, never the Markdown', () => {
    const open = vi.fn();
    const { container } = render(
      <NoteText
        markdown={
          '**Main findings**: *Cdk5* is [overactive](https://example.org/a)\n\n- one\n- two'
        }
        onOpenLink={open}
      />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('Main findings');
    expect(container.querySelector('em')?.textContent).toBe('Cdk5');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.textContent).not.toContain('**');
    fireEvent.click(screen.getByRole('link', { name: 'overactive' }));
    expect(open).toHaveBeenCalledWith('https://example.org/a');
  });

  it('show other kinds of link as plain words', () => {
    const { container } = render(
      <NoteText markdown="[run me](javascript:alert(1))" onOpenLink={vi.fn()} />,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('run me');
  });

  it('turn plain text into Markdown that shows the same words', () => {
    const plain = 'Line one\nLine *two* with 2 * 3\n\nA new paragraph # here';
    const markdown = plainTextToMarkdown(plain);
    expect(noteWords(markdown)).toBe('Line one\nLine *two* with 2 * 3\nA new paragraph # here');
    const { container } = render(<NoteText markdown={markdown} onOpenLink={vi.fn()} />);
    expect(container.querySelector('em')).toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('are edited in place and given back as Markdown', async () => {
    const done = vi.fn();
    render(
      <NoteTextEditor
        markdown="**Bold** and [a link](https://example.org)"
        label="Card text"
        onDone={done}
      />,
    );
    const box = await screen.findByRole('textbox', { name: 'Card text' });
    expect(box.querySelector('strong')?.textContent).toBe('Bold');
    await act(async () => {
      box.blur();
      fireEvent.blur(box);
      await Promise.resolve();
    });
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith('**Bold** and [a link](https://example.org)');
  });
});
