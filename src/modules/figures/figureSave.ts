/** Keeps failed edits dirty and serialises writes, including edits made during a save. */
export class FigureSave {
  private saved: string | null = null;
  private latest: string | null = null;
  private writing: Promise<void> | null = null;

  constructor(private readonly write: (text: string) => Promise<void>) {}

  get dirty(): boolean {
    return this.latest !== this.saved;
  }

  accept(text: string): boolean {
    if (this.dirty || this.writing !== null || text === this.saved) return false;
    this.saved = this.latest = text;
    return true;
  }

  edit(text: string): void {
    this.latest = text;
  }

  async flush(): Promise<void> {
    if (this.writing) await this.writing;
    if (!this.dirty) return;
    const writing = this.drain();
    this.writing = writing;
    try {
      await writing;
    } finally {
      if (this.writing === writing) this.writing = null;
    }
    // A new edit may have arrived as the previous write finished.
    if (this.latest !== this.saved) await this.flush();
  }

  private async drain(): Promise<void> {
    while (this.latest !== null && this.dirty) {
      const text = this.latest;
      await this.write(text);
      this.saved = text;
    }
  }
}
