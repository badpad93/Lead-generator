"use client";

import Markdown, { type Components } from "react-markdown";
import type { ComponentPropsWithoutRef } from "react";

/**
 * Safe Markdown for ASSISTANT text only. User messages stay plain text.
 *
 * Security model:
 *  - react-markdown builds a React element tree from the mdast; there is
 *    no HTML string and no dangerouslySetInnerHTML anywhere.
 *  - `skipHtml` drops raw HTML nodes (script, iframe, form, img, event
 *    handlers, anything) instead of rendering them.
 *  - `allowedElements` is an explicit allowlist; images, tables, and
 *    every other element are unwrapped to their text.
 *  - `urlTransform` accepts only http(s), mailto, tel, and site-relative
 *    paths. Everything else (javascript:, data:, vbscript:, protocol-
 *    relative //host) becomes an unlinked span.
 *  - External links open in a new tab with noopener/noreferrer/nofollow.
 */
const ALLOWED_ELEMENTS = ["p", "br", "strong", "em", "del", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "code", "pre", "a", "blockquote", "hr"];
const SAFE_PROTOCOL = /^(https?:|mailto:|tel:)/i;
const FOCUS = "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black";

/** Returns the href to render, or null when the URL must not be linked. */
export function safeHref(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  if (u.startsWith("/") && !u.startsWith("//") && !u.startsWith("/\\")) return u;
  if (SAFE_PROTOCOL.test(u)) return u;
  return null;
}

function isExternal(href: string): boolean {
  return /^https?:/i.test(href);
}

type Props<T extends keyof React.JSX.IntrinsicElements> = ComponentPropsWithoutRef<T> & { node?: unknown };

function Anchor({ node: _node, href, children, ...rest }: Props<"a">) {
  const safe = safeHref(href);
  if (!safe) return <span>{children}</span>;
  const external = isExternal(safe);
  return (
    <a
      {...rest}
      href={safe}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer nofollow" : undefined}
      className={`text-vinnie-green underline underline-offset-2 hover:text-white ${FOCUS}`}
    >
      {children}
    </a>
  );
}

const heading = (cls: string) =>
  function Heading({ node: _node, children }: Props<"h3">) {
    return <h3 className={cls}>{children}</h3>;
  };
const subheading = (cls: string) =>
  function Subheading({ node: _node, children }: Props<"h4">) {
    return <h4 className={cls}>{children}</h4>;
  };

const COMPONENTS: Components = {
  p: ({ node: _node, children }) => <p className="whitespace-pre-wrap">{children}</p>,
  strong: ({ node: _node, children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ node: _node, children }) => <em className="italic text-neutral-200">{children}</em>,
  del: ({ node: _node, children }) => <del className="text-neutral-400">{children}</del>,
  ul: ({ node: _node, children }) => <ul className="list-disc space-y-1 pl-5 marker:text-neutral-500">{children}</ul>,
  ol: ({ node: _node, children }) => <ol className="list-decimal space-y-1 pl-5 marker:text-neutral-400">{children}</ol>,
  li: ({ node: _node, children }) => <li className="pl-1">{children}</li>,
  h1: heading("text-base font-semibold text-white"),
  h2: heading("text-base font-semibold text-white"),
  h3: heading("text-[15px] font-semibold text-white"),
  h4: subheading("text-sm font-semibold text-neutral-100"),
  h5: subheading("text-sm font-semibold text-neutral-200"),
  h6: subheading("text-sm font-semibold text-neutral-300"),
  code: ({ node: _node, children }) => <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[13px] text-neutral-100">{children}</code>,
  pre: ({ node: _node, children }) => (
    <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-100 [&_code]:bg-transparent [&_code]:p-0">{children}</pre>
  ),
  a: Anchor,
  blockquote: ({ node: _node, children }) => <blockquote className="border-l-2 border-neutral-700 pl-3 text-neutral-300">{children}</blockquote>,
  hr: () => <hr className="border-neutral-800" />,
  br: () => <br />,
};

/** Assistant-authored text rendered as safe, monochrome Markdown. */
export function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-[15px] leading-relaxed text-white" data-testid="assistant-markdown">
      <Markdown components={COMPONENTS} allowedElements={ALLOWED_ELEMENTS} unwrapDisallowed skipHtml urlTransform={(url) => safeHref(url) ?? ""}>
        {text}
      </Markdown>
    </div>
  );
}
