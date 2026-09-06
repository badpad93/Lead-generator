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
    <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
      {STARTERS.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-black-primary transition-colors hover:border-green-primary/40 hover:bg-green-50 disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
