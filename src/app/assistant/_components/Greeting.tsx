"use client";

import { ASSISTANT_GREETING } from "@/lib/assistant/identity";
import { StarterQuestions } from "./StarterQuestions";
import { VinnieAvatar } from "./VinnieAvatar";

/** Empty-conversation state: the locked greeting plus starter prompts. */
export function Greeting({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 py-10 text-center" data-testid="assistant-greeting">
      <VinnieAvatar />
      <div className="space-y-2">
        <p className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{ASSISTANT_GREETING}</p>
        <p className="text-sm text-neutral-400">Machines, coffee, locations, and your orders. Vinnie can look things up, not buy or change anything.</p>
      </div>
      <StarterQuestions onPick={onPick} disabled={disabled} />
    </div>
  );
}
