import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { API_ENDPOINTS, API_ERRORS, buildOpenApiDocument } from "./spec";

const doc = buildOpenApiDocument("https://example.com");

/** Collect every "$ref" value in the document. */
function refs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => refs(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") out.push(v);
      else refs(v, out);
    }
  }
  return out;
}

function resolvePointer(pointer: string): unknown {
  expect(pointer.startsWith("#/")).toBe(true);
  return pointer
    .slice(2)
    .split("/")
    .reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), doc);
}

describe("OpenAPI document", () => {
  it("is an OpenAPI 3.1 document with info, servers and paths", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toMatch(/public API/);
    expect(doc.info.version).toBeTruthy();
    expect(doc.servers[0].url).toBe("https://example.com");
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });

  it("describes exactly the public endpoints", () => {
    expect(Object.keys(doc.paths).sort()).toEqual(
      [
        "/api/v1/search/",
        "/api/v1/hdb/blocks/{slug}/",
        "/api/v1/hdb/blocks/{slug}/sales/",
        "/api/v1/hdb/towns/",
        "/api/v1/condos/{slug}/",
        "/api/v1/launches/",
        "/api/v1/rates/",
        "/api/v1/calc/stamp-duty/",
        "/api/v1/calc/mortgage/",
      ].sort(),
    );
    for (const item of Object.values(doc.paths)) expect(Object.keys(item)).toEqual(["get"]);
  });

  it("has unique operation ids, declared path parameters and documented responses", () => {
    const ids = API_ENDPOINTS.map((e) => e.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of API_ENDPOINTS) {
      const op = doc.paths[e.path].get as { parameters: { name: string; in: string; required: boolean }[]; responses: Record<string, unknown> };
      const templated = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const pathParams = op.parameters.filter((p) => p.in === "path");
      expect(pathParams.map((p) => p.name)).toEqual(templated);
      expect(pathParams.every((p) => p.required)).toBe(true);
      expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(["200", "429", "500"]));
      for (const s of e.errors) expect(op.responses[String(s)]).toBeTruthy();
      expect(e.path.endsWith("/")).toBe(true);
      expect(e.example.startsWith(e.path.replace(/\{\w+\}.*$/, ""))).toBe(true);
    }
  });

  it("resolves every $ref", () => {
    const all = refs(doc);
    expect(all.length).toBeGreaterThan(10);
    for (const r of all) expect(resolvePointer(r), r).toBeTruthy();
  });

  it("generates JSON Schemas for responses without zod noise", () => {
    const block = doc.components.schemas.HdbBlockResponse as { type: string; properties: Record<string, unknown>; required: string[] };
    expect(block.type).toBe("object");
    expect(block.required).toEqual(expect.arrayContaining(["block", "links", "meta"]));
    const json = JSON.stringify(doc.components.schemas);
    expect(json).not.toContain("$schema");
    expect(json).not.toContain("9007199254740991");
    // responses may gain fields over time
    expect(json).not.toContain('"additionalProperties":false');
    expect(Object.keys(API_ERRORS).map(Number)).toEqual(expect.arrayContaining([400, 404, 429, 500, 503]));
  });

  it("has a route handler for every documented path", () => {
    for (const e of API_ENDPOINTS) {
      const file = path.join(process.cwd(), "src/app", e.path.replace(/\{(\w+)\}/g, "[$1]"), "route.ts");
      expect(fs.existsSync(file), file).toBe(true);
    }
  });

  it("publishes a contact e-mail only when one is configured", async () => {
    try {
      for (const [env, email] of [
        ["", undefined],
        ["hello@example.com", undefined],
        ["api@plotline.sg", "api@plotline.sg"],
      ] as const) {
        vi.resetModules();
        vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", env);
        const { buildOpenApiDocument: build } = await import("./spec");
        const contact = build("https://plotline.test").info.contact as { email?: string; url: string };
        expect(contact.email, env).toBe(email);
        expect(contact.url).toBe("https://plotline.test/docs/");
      }
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
