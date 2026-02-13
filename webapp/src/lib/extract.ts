/**
 * Extract structured lead data from Firecrawl scraped content.
 * Handles both single business pages and directory listings.
 */

export interface RawLead {
  business_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website: string;
  source_url: string;
  is_directory: boolean;
}

/** Try to extract phone numbers from text. */
function extractPhones(text: string): string[] {
  const phoneRegex =
    /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  return (text.match(phoneRegex) ?? []).map((p) => p.trim());
}

/** Try to extract a US address from text. */
function extractAddress(text: string): {
  address: string;
  city: string;
  state: string;
  zip: string;
} | null {
  // Match patterns like "123 Main St, Denver, CO 80202"
  const addrRegex =
    /(\d+\s+[A-Za-z0-9\s.#,]+?),\s*([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/;
  const match = text.match(addrRegex);
  if (match) {
    return {
      address: match[1].trim(),
      city: match[2].trim(),
      state: match[3].trim(),
      zip: match[4].trim(),
    };
  }
  return null;
}

/** Extract URLs that look like contact or about pages from a page. */
export function findFollowLinks(
  markdown: string,
  baseUrl: string
): string[] {
  const links: string[] = [];
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRegex.exec(markdown)) !== null) {
    const text = m[1].toLowerCase();
    const href = m[2];
    if (
      text.includes("contact") ||
      text.includes("about") ||
      text.includes("team") ||
      text.includes("leadership")
    ) {
      try {
        const resolved = new URL(href, baseUrl).href;
        // Only follow links on the same domain
        const baseDomain = new URL(baseUrl).hostname;
        const linkDomain = new URL(resolved).hostname;
        if (baseDomain === linkDomain) {
          links.push(resolved);
        }
      } catch {
        // skip invalid URLs
      }
    }
  }
  return links.slice(0, 3);
}

/** Extract business data from scraped markdown content. */
export function extractLeads(
  markdown: string,
  sourceUrl: string,
  targetCity: string,
  targetState: string
): RawLead[] {
  if (!markdown || markdown.length < 20) return [];

  const leads: RawLead[] = [];
  const lines = markdown.split("\n");

  // Heuristic: check if this looks like a directory (multiple business entries)
  const headingCount = lines.filter(
    (l) => l.startsWith("##") || l.startsWith("###")
  ).length;
  const isDirectory = headingCount > 3;

  if (isDirectory) {
    // Directory mode: split by headings and extract each
    let currentName = "";
    let currentBlock = "";

    for (const line of lines) {
      if (/^#{1,4}\s+/.test(line)) {
        // Process previous block
        if (currentName && currentBlock) {
          const lead = extractSingleLead(
            currentName,
            currentBlock,
            sourceUrl,
            targetCity,
            targetState,
            true
          );
          if (lead) leads.push(lead);
        }
        currentName = line.replace(/^#{1,4}\s+/, "").trim();
        currentBlock = "";
      } else {
        currentBlock += line + "\n";
      }
    }
    // Process last block
    if (currentName && currentBlock) {
      const lead = extractSingleLead(
        currentName,
        currentBlock,
        sourceUrl,
        targetCity,
        targetState,
        true
      );
      if (lead) leads.push(lead);
    }
  } else {
    // Single business page
    // Try to get the business name from the first heading
    const firstHeading = lines.find((l) => /^#{1,3}\s+/.test(l));
    const name = firstHeading
      ? firstHeading.replace(/^#{1,3}\s+/, "").trim()
      : "";
    if (name) {
      const lead = extractSingleLead(
        name,
        markdown,
        sourceUrl,
        targetCity,
        targetState,
        false
      );
      if (lead) leads.push(lead);
    }
  }

  return leads;
}

function extractSingleLead(
  name: string,
  text: string,
  sourceUrl: string,
  targetCity: string,
  targetState: string,
  isDirectory: boolean
): RawLead | null {
  // Skip obviously non-business headings
  const skipPatterns = [
    /^(home|menu|about|contact|search|login|sign)/i,
    /^(privacy|terms|cookie|faq|help)/i,
    /^(filter|sort|show|page|next|prev)/i,
  ];
  if (skipPatterns.some((p) => p.test(name))) return null;

  const phones = extractPhones(text);
  const addrInfo = extractAddress(text);

  // Try to extract website from content links
  let website = "";
  const urlMatch = text.match(
    /(?:website|url|visit|homepage)[:\s]+\[?([^\]\s]+)/i
  );
  if (urlMatch) {
    try {
      const u = new URL(urlMatch[1]);
      website = u.href;
    } catch {
      // not a valid URL
    }
  }

  // If no website found in text, use the source URL for single pages
  if (!website && !isDirectory) {
    website = sourceUrl;
  }

  return {
    business_name: name.substring(0, 255),
    address: addrInfo?.address ?? "",
    city: addrInfo?.city ?? targetCity,
    state: addrInfo?.state ?? targetState,
    zip: addrInfo?.zip ?? "",
    phone: phones[0] ?? "",
    website,
    source_url: sourceUrl,
    is_directory: isDirectory,
  };
}
