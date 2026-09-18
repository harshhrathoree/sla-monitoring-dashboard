/**
 * cleaner.test.ts — Unit tests for the data cleaning pipeline.
 *
 * Uses Node.js built-in test runner (node:test + node:assert).
 * Run with: node --experimental-vm-modules --import tsx/esm src/lib/cleaner.test.ts
 * Or via: npm test
 *
 * Every test is a pure function call — no network, no DB, no mocks.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isHeaderRow,
  hasMissingRequired,
  normaliseTimestamp,
  normaliseLatency,
  validateStatusCode,
  cleanRow,
  cleanBatch,
  type RawRow,
} from "./cleaner.js";

// ─── isHeaderRow ──────────────────────────────────────────────────────────────

describe("isHeaderRow", () => {
  it("returns true for a literal header string in status_code", () => {
    assert.equal(isHeaderRow({ status_code: "status_code" }), true);
  });

  it("returns true for empty status_code", () => {
    assert.equal(isHeaderRow({ status_code: "" }), true);
  });

  it("returns true for absent status_code", () => {
    assert.equal(isHeaderRow({}), true);
  });

  it("returns false for a numeric status_code", () => {
    assert.equal(isHeaderRow({ status_code: "200" }), false);
  });

  it("returns false for 5xx codes", () => {
    assert.equal(isHeaderRow({ status_code: "503" }), false);
  });
});

// ─── hasMissingRequired ───────────────────────────────────────────────────────

describe("hasMissingRequired", () => {
  it("returns true when service_id is absent", () => {
    assert.equal(
      hasMissingRequired({ timestamp: "2025-05-01T00:00:00Z", status_code: "200" }),
      true
    );
  });

  it("returns true when timestamp is absent", () => {
    assert.equal(
      hasMissingRequired({ service_id: "svc-auth", status_code: "200" }),
      true
    );
  });

  it("returns true when status_code is absent", () => {
    assert.equal(
      hasMissingRequired({ service_id: "svc-auth", timestamp: "2025-05-01T00:00:00Z" }),
      true
    );
  });

  it("returns false when all required fields are present", () => {
    assert.equal(
      hasMissingRequired({
        service_id: "svc-auth",
        timestamp: "2025-05-01T00:00:00Z",
        status_code: "200",
      }),
      false
    );
  });
});

// ─── normaliseTimestamp ───────────────────────────────────────────────────────

describe("normaliseTimestamp", () => {
  it("parses a UTC ISO string with no flags", () => {
    const { date, flags } = normaliseTimestamp("2025-05-13T12:00:00Z");
    assert.ok(date instanceof Date);
    assert.equal(date!.toISOString(), "2025-05-13T12:00:00.000Z");
    assert.deepEqual(flags, []);
  });

  it("parses a Unix epoch (10-digit int) and adds epoch_timestamp flag", () => {
    // 1746938700 → 2025-05-11T04:45:00.000Z
    const { date, flags } = normaliseTimestamp("1746938700");
    assert.ok(date instanceof Date);
    assert.equal(flags.includes("epoch_timestamp"), true);
  });

  it("normalises a +05:30 offset to UTC and adds tz_normalised flag", () => {
    // 2025-05-13T02:00:00+05:30 = 2025-05-12T20:30:00Z
    const { date, flags } = normaliseTimestamp("2025-05-13T02:00:00+05:30");
    assert.ok(date instanceof Date);
    assert.equal(date!.toISOString(), "2025-05-12T20:30:00.000Z");
    assert.equal(flags.includes("tz_normalised"), true);
  });

  it("returns null date for completely invalid input", () => {
    const { date } = normaliseTimestamp("not-a-date");
    assert.equal(date, null);
  });

  it("handles 9-digit epoch boundary (edge: valid range check)", () => {
    // 999999999 → 2001-09-08T21:46:39Z — still a valid epoch
    const { date, flags } = normaliseTimestamp("999999999");
    assert.ok(date instanceof Date);
    assert.equal(flags.includes("epoch_timestamp"), true);
  });
});

// ─── normaliseLatency ─────────────────────────────────────────────────────────

describe("normaliseLatency", () => {
  it("passes through ms values unchanged", () => {
    const { latencyMs, flags } = normaliseLatency("285", "ms");
    assert.equal(latencyMs, 285);
    assert.deepEqual(flags, []);
  });

  it("converts seconds to ms and adds unit_normalised flag", () => {
    const { latencyMs, flags } = normaliseLatency("0.717", "s");
    assert.equal(latencyMs, 717);
    assert.equal(flags.includes("unit_normalised"), true);
  });

  it("returns null + null_latency for empty string", () => {
    const { latencyMs, flags } = normaliseLatency("", "ms");
    assert.equal(latencyMs, null);
    assert.equal(flags.includes("null_latency"), true);
  });

  it("returns null + null_latency for undefined value", () => {
    const { latencyMs, flags } = normaliseLatency(undefined, "ms");
    assert.equal(latencyMs, null);
    assert.equal(flags.includes("null_latency"), true);
  });

  it("returns null + negative_latency for -223", () => {
    const { latencyMs, flags } = normaliseLatency("-223", "ms");
    assert.equal(latencyMs, null);
    assert.equal(flags.includes("negative_latency"), true);
    // Should NOT also add null_latency — the value was present, just negative
    assert.equal(flags.includes("null_latency"), false);
  });

  it("handles negative seconds value", () => {
    const { latencyMs, flags } = normaliseLatency("-0.5", "s");
    assert.equal(latencyMs, null);
    assert.equal(flags.includes("negative_latency"), true);
  });

  it("defaults to ms unit when latency_unit is absent", () => {
    const { latencyMs, flags } = normaliseLatency("300", undefined);
    assert.equal(latencyMs, 300);
    assert.deepEqual(flags, []);
  });

  it("accepts zero latency as valid (not flagged)", () => {
    const { latencyMs, flags } = normaliseLatency("0", "ms");
    assert.equal(latencyMs, 0);
    assert.deepEqual(flags, []);
  });
});

// ─── validateStatusCode ───────────────────────────────────────────────────────

describe("validateStatusCode", () => {
  it("returns no flags for 200", () => {
    assert.deepEqual(validateStatusCode(200), []);
  });

  it("returns no flags for 503", () => {
    assert.deepEqual(validateStatusCode(503), []);
  });

  it("returns no flags for boundary values 100 and 599", () => {
    assert.deepEqual(validateStatusCode(100), []);
    assert.deepEqual(validateStatusCode(599), []);
  });

  it("returns invalid_status for 999", () => {
    assert.equal(validateStatusCode(999).includes("invalid_status"), true);
  });

  it("returns invalid_status for 0", () => {
    assert.equal(validateStatusCode(0).includes("invalid_status"), true);
  });

  it("returns invalid_status for 99 (below 100)", () => {
    assert.equal(validateStatusCode(99).includes("invalid_status"), true);
  });

  it("returns invalid_status for 600 (above 599)", () => {
    assert.equal(validateStatusCode(600).includes("invalid_status"), true);
  });
});

// ─── cleanRow ─────────────────────────────────────────────────────────────────

describe("cleanRow", () => {
  const validRaw: RawRow = {
    service_id: "svc-auth",
    service_name: "auth-api",
    timestamp: "2025-05-13T12:45:00Z",
    status_code: "200",
    latency: "177",
    latency_unit: "ms",
    agent: "agent-1",
    region: "ap-south-1",
  };

  it("returns ok: true for a fully valid row", () => {
    const result = cleanRow(validRaw);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.row.serviceId, "svc-auth");
      assert.equal(result.row.statusCode, 200);
      assert.equal(result.row.latencyMs, 177);
      assert.equal(result.row.dataQualityFlags, "");
    }
  });

  it("returns ok: false with reason 'header' for a stray header row", () => {
    const result = cleanRow({ ...validRaw, status_code: "status_code" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "header");
  });

  it("returns ok: false with reason 'missing_required' when service_id absent", () => {
    const result = cleanRow({ ...validRaw, service_id: "" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_required");
  });

  it("accumulates epoch_timestamp + null_latency flags on the same row", () => {
    const result = cleanRow({
      ...validRaw,
      timestamp: "1746938700",
      latency: "",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      const flags = result.row.dataQualityFlags.split(",");
      assert.equal(flags.includes("epoch_timestamp"), true);
      assert.equal(flags.includes("null_latency"), true);
    }
  });

  it("normalises seconds latency for svc-search pattern", () => {
    const result = cleanRow({
      ...validRaw,
      service_id: "svc-search",
      latency: "0.717",
      latency_unit: "s",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.row.latencyMs, 717);
      assert.equal(result.row.dataQualityFlags.includes("unit_normalised"), true);
    }
  });

  it("flags invalid status code 999 but still returns ok: true", () => {
    const result = cleanRow({ ...validRaw, status_code: "999" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.row.statusCode, 999);
      assert.equal(result.row.dataQualityFlags.includes("invalid_status"), true);
    }
  });

  it("trims whitespace from service_id and agent fields", () => {
    const result = cleanRow({ ...validRaw, service_id: "  svc-auth  ", agent: " agent-1 " });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.row.serviceId, "svc-auth");
      assert.equal(result.row.agent, "agent-1");
    }
  });

  it("fills in service_name from service_id when absent", () => {
    const { service_name: _, ...withoutName } = validRaw;
    const result = cleanRow(withoutName);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.row.serviceName, "svc-auth");
    }
  });
});

// ─── cleanBatch ───────────────────────────────────────────────────────────────

describe("cleanBatch", () => {
  it("returns correct summary counts", () => {
    const rawRows: RawRow[] = [
      // Valid
      {
        service_id: "svc-auth",
        service_name: "auth-api",
        timestamp: "2025-05-13T12:00:00Z",
        status_code: "200",
        latency: "150",
        latency_unit: "ms",
        agent: "agent-1",
        region: "ap-south-1",
      },
      // Flagged (empty latency)
      {
        service_id: "svc-notify",
        service_name: "notify-worker",
        timestamp: "2025-05-13T12:15:00Z",
        status_code: "200",
        latency: "",
        latency_unit: "ms",
        agent: "agent-1",
        region: "ap-south-1",
      },
      // Skipped (header row)
      {
        service_id: "service_id",
        status_code: "status_code",
      },
      // Skipped (missing required)
      {
        service_id: "",
        timestamp: "2025-05-13T12:30:00Z",
        status_code: "200",
      },
    ];

    const result = cleanBatch(rawRows);
    assert.equal(result.rowsProcessed, 4);
    assert.equal(result.rows.length, 2); // 2 valid/flagged rows
    assert.equal(result.rowsFlagged, 1); // null_latency row
    assert.equal(result.rowsSkipped, 2); // header + missing required
  });

  it("returns empty rows array for all-header input", () => {
    const result = cleanBatch([
      { status_code: "status_code" },
      { status_code: "" },
    ]);
    assert.equal(result.rows.length, 0);
    assert.equal(result.rowsSkipped, 2);
  });
});
