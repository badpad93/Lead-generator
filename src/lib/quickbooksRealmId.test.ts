import { describe, it, expect } from "vitest";
import { parseQuickBooksRealmId, QB_REALM_ID_MAX_LENGTH } from "./quickbooksRealmId";

describe("parseQuickBooksRealmId", () => {
  it("accepts runs of 1 to 32 ASCII digits and returns them unchanged", () => {
    for (const ok of ["1", "9130357857777777", "4620816365123456789", "0".repeat(QB_REALM_ID_MAX_LENGTH)]) {
      expect(parseQuickBooksRealmId(ok), ok).toBe(ok);
    }
  });

  it("rejects everything that could alter a URL host or path, and every non-string", () => {
    const hostile: unknown[] = [
      "../../../v3/company/1",
      "9130/../../evil",
      "9130/companyinfo/1",
      "9130%2F..%2Fevil",
      "9130?x=1",
      "9130#frag",
      "9130@evil.example",
      "evil.example.com",
      "https://evil.example/",
      "//evil.example",
      "9130.1",
      "9130 ",
      " 9130",
      "91 30",
      "9130\n",
      "9130\t",
      "-9130",
      "+9130",
      "1e5",
      "0x10",
      "１２３４",
      "٣٤٥",
      "",
      "1".repeat(QB_REALM_ID_MAX_LENGTH + 1),
      null,
      undefined,
      9130357857777777,
      ["9130"],
      { toString: () => "9130" },
    ];
    for (const bad of hostile) expect(parseQuickBooksRealmId(bad), JSON.stringify(bad)).toBeNull();
  });
});
