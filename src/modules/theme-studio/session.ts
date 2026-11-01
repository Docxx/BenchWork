/** Keep imports and writes attached to this vault until they settle. */
export class ThemeSession {
  private pending = new Set<Promise<void>>();
  private closing = false;
  perform(task: () => Promise<void>): Promise<void> {
    if (this.closing) return Promise.reject(new Error('This workspace is closing.'));
    const pending = task().finally(() => {
      this.pending.delete(pending);
    });
    this.pending.add(pending);
    return pending;
  }
  async close() {
    this.closing = true;
    await Promise.allSettled([...this.pending]);
  }
}
