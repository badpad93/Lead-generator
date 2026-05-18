import { google } from "googleapis";

function getServiceAccountCredentials(): { email: string; key: string } {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return { email: json.client_email, key: json.private_key };
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";

  // Strip surrounding quotes if copied from JSON
  key = key.trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  }
  // Convert literal \n to actual newlines
  key = key.replace(/\\n/g, "\n");

  if (email && key) return { email, key };
  throw new Error("Google service account credentials not configured — set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
}

function getAuth() {
  const { email, key } = getServiceAccountCredentials();
  return new google.auth.JWT({
    email,
    key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

export interface LeadRow {
  business_name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  industry: string;
  google_maps_url: string;
  notes: string;
  assigned_rep: string;
  call_status: string;
  last_contacted: string;
}

const HEADERS = [
  "Business Name",
  "Phone Number",
  "Email",
  "Website",
  "Address",
  "City",
  "State",
  "ZIP",
  "Industry",
  "Google Maps URL",
  "Notes",
  "Assigned Rep",
  "Call Status",
  "Last Contacted",
];

export async function createLeadSheet(
  title: string,
  leads: LeadRow[],
  shareWithEmail?: string
): Promise<string> {
  const auth = getAuth();

  // Verify credentials before making API calls
  try {
    await auth.authorize();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Service account auth failed (check GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY): ${msg}`);
  }
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: "Leads", sheetId: 0 } }],
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId!;

  const rows = leads.map((l) => [
    l.business_name,
    l.phone,
    l.email,
    l.website,
    l.address,
    l.city,
    l.state,
    l.zip,
    l.industry,
    l.google_maps_url,
    l.notes,
    l.assigned_rep,
    l.call_status,
    l.last_contacted,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Leads!A1",
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS, ...rows] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Freeze header row
        {
          updateSheetProperties: {
            properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
        // Bold headers
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
        // Header row background (dark green)
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.133, green: 0.345, blue: 0.141, alpha: 1 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat",
          },
        },
        // Auto-resize columns
        {
          autoResizeDimensions: {
            dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: HEADERS.length },
          },
        },
        // Add filter
        {
          setBasicFilter: {
            filter: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: rows.length + 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
            },
          },
        },
      ],
    },
  });

  // Share the sheet — try multiple strategies, none are blocking
  try {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch {
    // Org policy may block public sharing — that's fine, share individually instead
  }

  if (shareWithEmail) {
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: { role: "writer", type: "user", emailAddress: shareWithEmail },
        sendNotificationEmail: false,
      });
    } catch {
      // Non-critical
    }
  }

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}
