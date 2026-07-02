"use client";

import { useState } from "react";
import { Star, Loader2, CheckCircle2 } from "lucide-react";

export interface ExistingRating {
  score: number;
  feedback: string | null;
  tags: string[];
  created_at: string;
}

interface RatingCardProps {
  title: string;
  description: string;
  existing: ExistingRating | null;
  saving: boolean;
  error?: string | null;
  onSubmit: (payload: { score: number; feedback: string; tags: string[] }) => void | Promise<void>;
  tagOptions?: string[];
}

export default function RatingCard({
  title,
  description,
  existing,
  saving,
  error,
  onSubmit,
  tagOptions = [],
}: RatingCardProps) {
  const [score, setScore] = useState(existing?.score ?? 5);
  const [hover, setHover] = useState<number | null>(null);
  const [feedback, setFeedback] = useState(existing?.feedback ?? "");
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);

  if (existing) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          <p className="text-sm font-semibold text-emerald-900">{title} — submitted</p>
        </div>
        <div className="flex items-center gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`h-5 w-5 ${n <= existing.score ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
            />
          ))}
          <span className="text-xs text-gray-500 ml-2">{existing.score}/5</span>
        </div>
        {existing.feedback && <p className="text-sm text-gray-700 whitespace-pre-wrap">{existing.feedback}</p>}
        {existing.tags && existing.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {existing.tags.map((t) => (
              <span key={t} className="rounded-full bg-white text-emerald-700 text-[10px] px-2.5 py-0.5 border border-emerald-200">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  const toggleTag = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((c) => c !== t) : [...cur, t]));

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-3">{description}</p>

      <div className="flex items-center gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setScore(n)}
            className="cursor-pointer"
          >
            <Star
              className={`h-7 w-7 transition-colors ${
                n <= (hover ?? score) ? "fill-amber-400 text-amber-400" : "text-gray-300 hover:text-amber-300"
              }`}
            />
          </button>
        ))}
        <span className="text-sm text-gray-500 ml-3">{score}/5</span>
      </div>

      {tagOptions.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1.5">Quick tags (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {tagOptions.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  tags.includes(t)
                    ? "bg-green-primary text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={3}
        placeholder="Optional feedback…"
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none resize-none mb-3"
      />

      {error && (
        <p className="text-sm text-red-600 mb-2">{error}</p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onSubmit({ score, feedback, tags })}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-green-primary hover:bg-green-hover px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
          Submit Rating
        </button>
      </div>
    </div>
  );
}
