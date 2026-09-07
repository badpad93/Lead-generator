import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantMarkdown, safeHref } from "./_components/AssistantMarkdown";
import { MessageList } from "./_components/MessageList";
import type { ChatMessage } from "./_components/types";

const render = (text: string) => renderToStaticMarkup(createElement(AssistantMarkdown, { text }));
const COLOR = /\b(?:bg|text|border)-(?:green|amber|red|blue|yellow)-\d/;

describe("assistant Markdown rendering", () => {
  it("renders paragraphs, line breaks, bold, and italics", () => {
    const html = render("First **bold** and *italic*.\n\nSecond paragraph  \nwith a break.");
    expect(html).toContain("<strong class=\"font-semibold text-white\">bold</strong>");
    expect(html).toContain("<em class=\"italic text-neutral-200\">italic</em>");
    expect(html.match(/<p /g)?.length).toBe(2);
    expect(html).toContain("<br/>");
    expect(html).not.toContain("**");
  });

  it("renders ordered and unordered lists and headings", () => {
    const html = render("# Title\n\n## Sub\n\n- one\n- two\n\n1. first\n2. second");
    expect(html).toContain("<h3 class=\"text-base font-semibold text-white\">Title</h3>");
    expect(html).toContain("<ul class=\"list-disc space-y-1 pl-5 marker:text-neutral-500\">");
    expect(html).toContain("<ol class=\"list-decimal space-y-1 pl-5 marker:text-neutral-400\">");
    expect(html.match(/<li /g)?.length).toBe(4);
    expect(html).not.toContain("<h1");
  });

  it("renders inline code and fenced code blocks", () => {
    const html = render("Use `pnpm test` then:\n\n```bash\npnpm build\n```");
    expect(html).toContain("<code class=\"rounded bg-neutral-800 px-1 py-0.5 font-mono text-[13px] text-neutral-100\">pnpm test</code>");
    expect(html).toContain("<pre class=\"overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3");
    expect(html).toContain("pnpm build");
  });

  it("links safe URLs; external links get target and rel, site-relative links do not", () => {
    const html = render("[Docs](https://vendingconnector.com/coffee) and [Shop](/coffee) and [Mail](mailto:hi@example.com)");
    expect(html).toContain('href="https://vendingconnector.com/coffee" target="_blank" rel="noopener noreferrer nofollow"');
    expect(html).toContain('href="/coffee"');
    expect(html).not.toContain('href="/coffee" target');
    expect(html).toContain('href="mailto:hi@example.com"');
    expect(html).toContain("text-vinnie-green");
  });

  it("refuses unsafe URL schemes and protocol-relative links", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "vbscript:x", "//evil.example/x", "JAVASCRIPT:alert(1)", "file:///etc/passwd"]) {
      const html = render(`[click](${bad})`);
      expect(html).not.toContain("<a ");
      expect(html).toContain("<span>click</span>");
      expect(safeHref(bad)).toBeNull();
    }
    expect(safeHref("/machines-for-sale/1")).toBe("/machines-for-sale/1");
    expect(safeHref("https://x.y")).toBe("https://x.y");
  });

  it("never renders raw HTML, scripts, iframes, forms, images, embeds, or event handlers", () => {
    const html = render([
      "<script>alert(1)</script>",
      "<iframe src=\"https://evil.example\"></iframe>",
      "<form action=\"https://evil.example\"><input name=\"card\"></form>",
      "<img src=x onerror=\"alert(1)\">",
      "<embed src=\"x\"><object data=\"x\"></object>",
      "<a href=\"https://ok.example\" onclick=\"alert(1)\">x</a>",
      "![pic](https://cdn.example/a.png)",
      "safe **text**",
    ].join("\n\n"));
    for (const tag of ["<script", "<iframe", "<form", "<input", "<img", "<embed", "<object", "onerror", "onclick", "alert(1)"]) expect(html).not.toContain(tag);
    expect(html).toContain("<strong class=\"font-semibold text-white\">text</strong>");
  });

  it("keeps the monochrome palette", () => {
    const html = render("# H\n\n> quote\n\n---\n\n- a\n\n`c`\n\n[l](https://a.b)");
    expect(html).not.toMatch(COLOR);
  });
});

describe("user messages stay plain text", () => {
  it("escapes HTML and leaves Markdown syntax literal in user bubbles", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "<b>hi</b> **not bold** [x](javascript:alert(1))", blocks: [], interrupted: false, created_at: "" },
      { id: "a1", role: "assistant", content: "**bold reply**", blocks: [], interrupted: false, created_at: "" },
    ];
    const html = renderToStaticMarkup(createElement(MessageList, { messages }));
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt; **not bold** [x](javascript:alert(1))");
    expect(html).not.toContain("<b>hi</b>");
    expect(html).not.toContain('href="javascript');
    expect(html).toContain("<strong class=\"font-semibold text-white\">bold reply</strong>");
    expect(html).toContain('data-testid="assistant-markdown"');
  });
});
