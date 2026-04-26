const PANDADOC_API_URL = "https://api.pandadoc.com/public/v1";

function getApiKey(): string {
  const key = process.env.PANDADOC_API_KEY;
  if (!key) throw new Error("PANDADOC_API_KEY not configured");
  return key;
}

async function pandadocFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${PANDADOC_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `API-Key ${getApiKey()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

interface CreateDocumentParams {
  templateId: string;
  documentName: string;
  recipientEmail: string;
  recipientName: string;
  fields?: Record<string, string>;
}

export async function createDocumentFromTemplate(
  params: CreateDocumentParams
): Promise<{ id: string; status: string }> {
  const body = {
    name: params.documentName,
    template_uuid: params.templateId,
    recipients: [
      {
        email: params.recipientEmail,
        first_name: params.recipientName.split(" ")[0],
        last_name: params.recipientName.split(" ").slice(1).join(" ") || "",
        role: "signer",
      },
    ],
    fields: params.fields || {},
    parse_form_fields: false,
  };

  const res = await pandadocFetch("/documents", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PandaDoc create failed: ${err}`);
  }

  return res.json();
}

export async function sendDocument(
  documentId: string,
  message?: string
): Promise<{ id: string; status: string }> {
  const body = {
    message: message || "Please review and sign this document.",
    silent: false,
  };

  const res = await pandadocFetch(`/documents/${documentId}/send`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PandaDoc send failed: ${err}`);
  }

  return res.json();
}

export async function getDocumentStatus(
  documentId: string
): Promise<{ id: string; status: string; name: string }> {
  const res = await pandadocFetch(`/documents/${documentId}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PandaDoc status check failed: ${err}`);
  }
  return res.json();
}

export async function downloadSignedPdf(
  documentId: string
): Promise<Buffer> {
  const res = await fetch(
    `${PANDADOC_API_URL}/documents/${documentId}/download`,
    {
      headers: { Authorization: `API-Key ${getApiKey()}` },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PandaDoc download failed: ${err}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const secret = process.env.PANDADOC_WEBHOOK_SECRET;
  if (!secret) return true;
  // PandaDoc uses shared secret verification — compare directly
  return signature === secret;
}
