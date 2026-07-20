"use client";

/**
 * Shared inputs for the website-builder wizard. Same base styling as
 * agreement editor for consistency; each accepts a value + onChange +
 * disabled flag so read-only mode drops in cleanly.
 */

import React from "react";

const baseInput = "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30 disabled:bg-gray-50 disabled:text-gray-500";
const labelCls = "block text-xs font-medium text-gray-700 mb-1";
const hintCls = "text-[11px] text-gray-500 mt-1";

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className={labelCls}>{children}</label>
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  );
}

export function TextField(props: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
  type?: string;
  required?: boolean;
}) {
  const { label, value, onChange, disabled, placeholder, hint, type = "text", required } = props;
  return (
    <div>
      <label className={labelCls}>{label}{required && <span className="text-red-500"> *</span>}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={baseInput}
      />
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  );
}

export function TextArea(props: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
  rows?: number;
  required?: boolean;
}) {
  const { label, value, onChange, disabled, placeholder, hint, rows = 4, required } = props;
  return (
    <div>
      <label className={labelCls}>{label}{required && <span className="text-red-500"> *</span>}</label>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={baseInput}
      />
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  );
}

export function ColorField(props: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { label, value, onChange, disabled } = props;
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#16a34a"}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-14 rounded border border-gray-200 cursor-pointer disabled:cursor-not-allowed"
        />
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#16a34a"
          disabled={disabled}
          className={baseInput}
        />
      </div>
    </div>
  );
}

export function ChipToggle<T extends string>(props: {
  label: string;
  options: Array<{ value: T; label: string }>;
  selected: T[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { label, options, selected, onChange, disabled, hint } = props;
  function toggle(v: T) {
    if (disabled) return;
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  }
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              disabled={disabled}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer disabled:cursor-not-allowed ${on
                ? "border-green-600 bg-green-50 text-green-800"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  );
}

export function RadioGroup<T extends string>(props: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const { label, options, value, onChange, disabled } = props;
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => !disabled && onChange(o.value)}
            disabled={disabled}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer disabled:cursor-not-allowed ${value === o.value
              ? "border-green-600 bg-green-50 text-green-800"
              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Checkbox(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { label, checked, onChange, disabled, hint } = props;
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
      />
      <span className="flex-1">
        <span className="block text-gray-800">{label}</span>
        {hint && <span className={hintCls}>{hint}</span>}
      </span>
    </label>
  );
}
