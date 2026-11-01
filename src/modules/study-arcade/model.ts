export interface Question {
  id: string;
  prompt: string;
  answer: string;
  options: string[];
  correct: number;
  image: string | null;
  source: string;
}
export interface Bank {
  title: string;
  questions: Question[];
}
export interface Result {
  question: string;
  correct: boolean;
}
export const newQuestion = (): Question => ({
  id: crypto.randomUUID(),
  prompt: '',
  answer: '',
  options: [],
  correct: 0,
  image: null,
  source: '',
});
export const newBank = (): Bank => ({ title: 'New study set', questions: [newQuestion()] });
export function parseBank(data: Record<string, unknown>): Bank {
  if (
    typeof data.title !== 'string' ||
    !Array.isArray(data.questions) ||
    data.questions.length > 1000
  )
    throw new Error('This study set could not be read.');
  return {
    title: data.title.slice(0, 500),
    questions: data.questions.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object') throw new Error('Invalid question.');
      const q = raw as Record<string, unknown>;
      if (
        typeof q.prompt !== 'string' ||
        typeof q.answer !== 'string' ||
        !Array.isArray(q.options) ||
        !q.options.every((o: unknown) => typeof o === 'string')
      )
        throw new Error('A question could not be read.');
      const options = q.options.slice(0, 8).map((o) => o.slice(0, 500));
      return {
        id: typeof q.id === 'string' ? q.id : crypto.randomUUID(),
        prompt: q.prompt.slice(0, 10000),
        answer: q.answer.slice(0, 10000),
        options,
        correct:
          typeof q.correct === 'number' &&
          Number.isInteger(q.correct) &&
          q.correct >= 0 &&
          q.correct < options.length
            ? q.correct
            : 0,
        image:
          typeof q.image === 'string' &&
          !/^[a-z][a-z0-9+.-]*:|^[/\\]|(^|[/\\])\.\.([/\\]|$)/i.test(q.image)
            ? q.image
            : null,
        source: typeof q.source === 'string' ? q.source.slice(0, 1000) : '',
      };
    }),
  };
}
export function score(results: Result[]) {
  return {
    correct: results.filter((r) => r.correct).length,
    total: results.length,
    points: results.filter((r) => r.correct).length * 100,
  };
}
export function readyQuestions(bank: Bank): Question[] {
  return bank.questions.filter(
    (q) =>
      q.prompt.trim() &&
      ((q.options.length >= 2 && q.options[q.correct]?.trim()) ||
        (q.options.length === 0 && q.answer.trim())),
  );
}
