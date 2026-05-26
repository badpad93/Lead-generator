import { google } from "googleapis";

function getAuth() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth credentials not configured — set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN"
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
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
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  // Create spreadsheet in the designated folder (or root of user's Drive)
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  let spreadsheetId: string;
  try {
    const file = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: "application/vnd.google-apps.spreadsheet",
        ...(folderId ? { parents: [folderId] } : {}),
      },
      fields: "id",
    });
    spreadsheetId = file.data.id!;
  } catch (err: unknown) {
    const gaxErr = err as { code?: number; response?: { data?: unknown }; message?: string };
    const responseData = gaxErr.response?.data as Record<string, unknown> | undefined;
    console.error("[googleSheets] drive.files.create failed:", JSON.stringify({
      code: gaxErr.code,
      message: gaxErr.message,
      responseData,
    }, null, 2));

    if (responseData?.error === "invalid_grant") {
      throw new Error(
        "Google OAuth refresh token has expired or been revoked. " +
        "An admin can generate a new one at /api/admin/google-token (GET) — " +
        "follow the auth_url, then set the returned refresh_token as GOOGLE_OAUTH_REFRESH_TOKEN."
      );
    }
    throw new Error(`Drive file create failed: ${JSON.stringify(responseData || gaxErr.message)}`);
  }

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
    range: "Sheet1!A1",
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS, ...rows] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Rename default sheet to "Leads"
        {
          updateSheetProperties: {
            properties: { sheetId: 0, title: "Leads" },
            fields: "title",
          },
        },
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

  // Share the sheet — make accessible via link
  try {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { role: "writer", type: "anyone" },
    });
  } catch {
    // User's account may restrict public sharing
  }

  // Share with specific rep if email provided
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
