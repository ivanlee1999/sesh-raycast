import { describe, expect, it } from "vitest";

import {
  decodeTaskRef,
  decodeTaskRefs,
  encodeTaskRef,
  encodeTaskRefs,
  splitTaskRefs,
} from "../task-ref";

/**
 * These have to agree exactly with `sesh-web/src/lib/task-ref.ts`. A session
 * started from Raycast writes this string into the same column the web app
 * reads, and the server dispatches the focused minutes off it — get the
 * encoding wrong and a Things uuid is sent to Todoist.
 */
describe("task refs", () => {
  it("leaves a Todoist id bare, so existing rows keep working", () => {
    expect(encodeTaskRef("todoist", "6X4Vw2Hfmg73Q2XR")).toBe(
      "6X4Vw2Hfmg73Q2XR",
    );
  });

  it("namespaces every other provider", () => {
    expect(encodeTaskRef("things", "ABC-123")).toBe("things:ABC-123");
  });

  it("reads a bare id back as Todoist", () => {
    expect(decodeTaskRef("6X4Vw2Hfmg73Q2XR")).toEqual({
      provider: "todoist",
      id: "6X4Vw2Hfmg73Q2XR",
    });
  });

  it("reads a namespaced ref back as its provider", () => {
    expect(decodeTaskRef("things:ABC-123")).toEqual({
      provider: "things",
      id: "ABC-123",
    });
  });

  it("does not mistake a colon in a Todoist id for a provider prefix", () => {
    expect(decodeTaskRef("weird:id")).toEqual({
      provider: "todoist",
      id: "weird:id",
    });
  });

  it("returns null for nothing", () => {
    expect(decodeTaskRef(null)).toBeNull();
    expect(decodeTaskRef("")).toBeNull();
  });

  it("joins a list with commas, since neither id kind contains one", () => {
    expect(encodeTaskRefs(["12345", "things:ABC"])).toBe("12345,things:ABC");
  });

  it("encodes a single ref to exactly the bare value it always was", () => {
    expect(encodeTaskRefs(["12345"])).toBe("12345");
  });

  it("encodes nothing as null, not an empty string", () => {
    expect(encodeTaskRefs([])).toBeNull();
    expect(encodeTaskRefs(["", "  "])).toBeNull();
  });

  it("splits and trims a stored list", () => {
    expect(splitTaskRefs(" 12345 , things:ABC ")).toEqual([
      "12345",
      "things:ABC",
    ]);
    expect(splitTaskRefs(null)).toEqual([]);
  });

  it("decodes a whole stored list to providers and ids", () => {
    expect(decodeTaskRefs("12345,things:ABC")).toEqual([
      { provider: "todoist", id: "12345" },
      { provider: "things", id: "ABC" },
    ]);
  });

  it("round-trips", () => {
    const refs = ["12345", "things:ABC-DEF"];
    const decoded = decodeTaskRefs(encodeTaskRefs(refs));
    expect(decoded.map((ref) => encodeTaskRef(ref.provider, ref.id))).toEqual(
      refs,
    );
  });
});
