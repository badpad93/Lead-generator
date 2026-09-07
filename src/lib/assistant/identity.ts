/**
 * Locked product identity for the assistant (business decision, 2026-09-07).
 *
 * Dependency-free so both the server prompt builder and the client UI can
 * import it without pulling server-only modules into the browser bundle.
 * Change these values only with an explicit product decision, and bump
 * PROMPT_VERSION in ./config.ts when the name or label changes.
 */
export const ASSISTANT_NAME = "Vinnie";
export const ASSISTANT_LABEL = "Vending Connector AI";
export const ASSISTANT_GREETING = "Hi, I'm Vinnie. What can I help you build today?";
export const ASSISTANT_PAGE_TITLE = "Vinnie | Vending Connector";
