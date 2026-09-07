"use client";

export const STARTERS = [
  "What does Vending Connector do?",
  "Show me coffee products I can order",
  "What vending machines are for sale right now?",
  "How does location placement pricing work?",
  "Compare a couple of coffee options for a small office",
  "What's the status of my latest order?",
];

export function StarterQuestions({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-2" aria-label="Suggested questions">
      {STARTERS.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          className="min-h-11 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-white transition-colors hover:border-neutral-400 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
