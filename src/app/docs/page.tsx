import Link from "next/link";
import { Braces, ExternalLink } from "lucide-react";
import { site } from "@/lib/config/site";
import { pageMetadata } from "@/lib/seo";
import { getHdbBlocks, getTowns } from "@/lib/data/hdb";
import { getProjects } from "@/lib/data/private";
import { API_ENDPOINTS, API_ERRORS, API_LICENCE_NOTES, type ApiEndpoint } from "@/lib/api/spec";
import { PUBLIC_API_RATE_LIMIT } from "@/lib/api/constants";
import { ApiError } from "@/lib/api/http";
import { v1Condo, v1HdbBlock, v1HdbBlockSales, v1Launches, v1Mortgage, v1Rates, v1Search, v1StampDuty, v1Towns } from "@/lib/api/v1";
import { T } from "@/components/i18n/t";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";

export const revalidate = 86400;

export const metadata = pageMetadata({
  title: "Public API",
  description: `${site.name}'s free, read-only JSON API for Singapore property data: HDB blocks, sales and towns, condo projects, new launches, interest rates, and stamp duty and mortgage calculators. No key needed.`,
  path: "/docs/",
});

type Example = { path: string; status: number; body: unknown; note?: string };

/** Example slugs taken from the live dataset so every example works on this deployment. */
function exampleSlugs() {
  const block = getHdbBlocks().reduce<{ slug: string; n: number } | null>((best, b) => (!best || b.tx.count > best.n ? { slug: b.slug, n: b.tx.count } : best), null);
  const condo = getProjects()
    .filter((p) => !p.isLanded)
    .reduce<{ slug: string; n: number } | null>((best, p) => (!best || p.tx.count > best.n ? { slug: p.slug, n: p.tx.count } : best), null);
  const town = getTowns()[0]?.town.toLowerCase() ?? null;
  return { block: block?.slug ?? null, condo: condo?.slug ?? null, town };
}

function examplePath(e: ApiEndpoint, slugs: ReturnType<typeof exampleSlugs>): string {
  switch (e.operationId) {
    case "search":
      return slugs.town ? `/api/v1/search/?q=${encodeURIComponent(slugs.town)}&limit=5` : e.example;
    case "getHdbBlock":
      return slugs.block ? `/api/v1/hdb/blocks/${slugs.block}/` : e.example;
    case "getHdbBlockSales":
      return slugs.block ? `/api/v1/hdb/blocks/${slugs.block}/sales/` : e.example;
    case "getCondo":
      return slugs.condo ? `/api/v1/condos/${slugs.condo}/` : e.example;
    default:
      return e.example;
  }
}

function produce(e: ApiEndpoint, path: string): unknown {
  const url = new URL(path, "http://localhost");
  const params = url.searchParams;
  const slug = /\/(?:blocks|condos)\/([^/]+)\//.exec(url.pathname)?.[1] ?? "";
  switch (e.operationId) {
    case "search":
      return v1Search(params);
    case "getHdbBlock":
      return v1HdbBlock(slug);
    case "getHdbBlockSales":
      return v1HdbBlockSales(slug);
    case "listHdbTowns":
      return v1Towns();
    case "getCondo":
      return v1Condo(slug);
    case "listLaunches":
      return v1Launches(params);
    case "getRates":
      return v1Rates();
    case "calcStampDuty":
      return v1StampDuty(params);
    case "calcMortgage":
      return v1Mortgage(params);
    default:
      return null;
  }
}

/** Run the endpoint's builder directly (no HTTP) to show a real response. */
function runExample(e: ApiEndpoint, slugs: ReturnType<typeof exampleSlugs>): Example {
  const path = examplePath(e, slugs);
  try {
    return { path, status: 200, body: abbreviate(produce(e, path)) };
  } catch (err) {
    if (err instanceof ApiError) return { path, status: err.status, body: { error: err.code, message: err.message } };
    return { path, status: 500, body: { error: "internal_error", message: "Example unavailable." } };
  }
}

/** Shorten arrays to their first two items so examples stay readable. */
function abbreviate(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.slice(0, 2).map((v) => abbreviate(v, depth + 1));
  if (value && typeof value === "object" && depth < 8) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, abbreviate(v, depth + 1)]));
  return value;
}

function Code({ children }: { children: string }) {
  return (
    <pre className="max-h-96 max-w-full overflow-auto rounded-lg border border-line bg-canvas p-3 text-xs leading-5 text-ink">
      <code>{children}</code>
    </pre>
  );
}

const TAGS: ApiEndpoint["tag"][] = ["Search", "HDB", "Private", "Rates", "Calculators"];

export default function DocsPage() {
  const slugs = exampleSlugs();
  const base = `${site.url}/api/v1/`;
  const firstExample = `${site.url}${examplePath(API_ENDPOINTS[1], slugs)}`;

  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: "Public API" }]} />
      <PageHeader
        eyebrow={<T k="trust.docs.eyebrow" fallback="Developers" />}
        title={<T k="trust.docs.title" fallback="Public API" />}
        description={<T k="trust.docs.intro" fallback="A free, read-only JSON API over the same data as the website. No key or sign-up needed." />}
      >
        <div className="flex flex-wrap gap-2">
          {/* plain anchor: /openapi.json is a route handler, not a page */}
          <a href="/openapi.json" className={buttonClass("outline", "sm")}>
            <Braces className="size-4" aria-hidden />
            <T k="trust.docs.openapi" fallback="OpenAPI 3.1 document" />
          </a>
          <ButtonLink href="#endpoints" variant="secondary" size="sm">
            <T k="trust.docs.jump" fallback="Endpoints" />
          </ButtonLink>
        </div>
      </PageHeader>

      <div className="space-y-10 pb-8">
        <Section id="overview" title={<T k="trust.docs.overview" fallback="Overview" />}>
          <Card>
            <CardBody>
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-ink">
                    <T k="trust.docs.base" fallback="Base URL" />
                  </dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-muted">{base}</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">
                    <T k="trust.docs.auth" fallback="Authentication" />
                  </dt>
                  <dd className="mt-0.5 text-muted">
                    <T k="trust.docs.authBody" fallback="None. Every endpoint is a public GET." />
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">
                    <T k="trust.docs.rate" fallback="Rate limit" />
                  </dt>
                  <dd className="mt-0.5 text-muted">
                    <T k="trust.docs.rateBody" fallback="{max} requests per {sec} seconds per IP address. Over the limit you get HTTP 429 with a Retry-After header." vars={{ max: PUBLIC_API_RATE_LIMIT.max, sec: PUBLIC_API_RATE_LIMIT.windowSec }} />
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">
                    <T k="trust.docs.cors" fallback="CORS" />
                  </dt>
                  <dd className="mt-0.5 text-muted">
                    <T k="trust.docs.corsBody" fallback="Open to every origin, so you can call it from a browser." />
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">
                    <T k="trust.docs.caching" fallback="Caching" />
                  </dt>
                  <dd className="mt-0.5 text-muted">
                    <T k="trust.docs.cachingBody" fallback="Data responses are cached for up to an hour and calculator responses for up to a day. The dataset itself is refreshed at most daily." />
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">
                    <T k="trust.docs.slash" fallback="Trailing slash" />
                  </dt>
                  <dd className="mt-0.5 text-muted">
                    <T k="trust.docs.slashBody" fallback="Paths end with a slash, before any query string. Requests without it get a 308 redirect that carries no CORS headers, so browsers block it on cross-origin calls: always include the slash." />
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-ink">
              <T k="trust.docs.quickStart" fallback="Quick start" />
            </p>
            <Code>{`curl "${firstExample}"`}</Code>
            <Code>{`const res = await fetch("${firstExample}");\nif (!res.ok) throw new Error((await res.json()).message);\nconst data = await res.json();`}</Code>
          </div>
        </Section>

        <Section id="errors" title={<T k="trust.docs.errors" fallback="Errors" />} description={<T k="trust.docs.errorsIntro" fallback='Errors return JSON with a machine-readable code and a message, for example {"error": "not_found", "message": "No HDB block matches that slug."}. Error responses are never cached.' />}>
          <Card>
            <CardBody className="p-0">
              <ul className="divide-y divide-line">
                {Object.entries(API_ERRORS).map(([status, err]) => (
                  <li key={status} className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:gap-4">
                    <span className="w-40 shrink-0 font-mono text-xs text-ink">
                      {status} <span className="text-muted">{err.code}</span>
                    </span>
                    <span className="text-muted">{err.description}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </Section>

        <section id="endpoints" aria-labelledby="endpoints-title" className="scroll-mt-24 space-y-8">
          <h2 id="endpoints-title" className="text-lg font-semibold text-ink sm:text-xl">
            <T k="trust.docs.endpoints" fallback="Endpoints" />
          </h2>
          {TAGS.map((tag) => {
            const endpoints = API_ENDPOINTS.filter((e) => e.tag === tag);
            if (!endpoints.length) return null;
            return (
              <div key={tag} className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{tag}</h3>
                {endpoints.map((e) => {
                  const ex = runExample(e, slugs);
                  return (
                    <Card key={e.operationId} id={e.operationId} className="scroll-mt-24">
                      <CardBody className="space-y-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="brand">{e.method}</Badge>
                            <code className="break-all font-mono text-sm font-semibold text-ink">{e.path}</code>
                          </div>
                          <h4 className="mt-2 font-semibold text-ink">{e.summary}</h4>
                          <p className="mt-1 text-sm text-muted">{e.description}</p>
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">
                            <T k="trust.docs.params" fallback="Parameters" />
                          </p>
                          {e.params.length ? (
                            <dl className="mt-2 space-y-2 text-sm">
                              {e.params.map((p) => (
                                <div key={p.name} className="rounded-lg border border-line px-3 py-2">
                                  <dt className="flex flex-wrap items-center gap-2">
                                    <code className="font-mono text-sm font-semibold text-ink">{p.name}</code>
                                    <span className="text-xs text-muted">{p.in === "path" ? "path" : "query"}</span>
                                    {p.required ? (
                                      <Badge tone="warn">
                                        <T k="trust.docs.required" fallback="required" />
                                      </Badge>
                                    ) : (
                                      <Badge>
                                        <T k="trust.docs.optional" fallback="optional" />
                                      </Badge>
                                    )}
                                  </dt>
                                  <dd className="mt-1 text-muted">{p.description}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="mt-1 text-sm text-muted">
                              <T k="trust.docs.noParams" fallback="None." />
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">
                              <T k="trust.docs.example" fallback="Example" />
                            </p>
                            <a href={ex.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                              <T k="trust.docs.try" fallback="Open in a new tab" />
                              <ExternalLink className="size-3.5" aria-hidden />
                            </a>
                          </div>
                          <Code>{`GET ${ex.path}`}</Code>
                          <p className="text-xs text-muted">
                            <T k="trust.docs.response" fallback="Response {status} (arrays shortened to two items; schema {schema} in the OpenAPI document)" vars={{ status: ex.status, schema: e.response }} />
                          </p>
                          <Code>{JSON.stringify(ex.body, null, 2)}</Code>
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            );
          })}
        </section>

        <Section id="attribution" title={<T k="trust.docs.attribution" fallback="Attribution and licences" />}>
          <div className="space-y-3">
            {API_LICENCE_NOTES.map((n) => (
              <Card key={n.title}>
                <CardBody>
                  <h3 className="font-semibold text-ink">{n.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{n.body}</p>
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                      {n.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </CardBody>
              </Card>
            ))}
            <Notice>
              <T k="trust.docs.terms" fallback="Use of the API is subject to our terms of use. Figures are information only, not financial advice." />{" "}
              <Link href="/tos/#api" className="font-medium underline">
                <T k="trust.docs.termsLink" fallback="Read the API terms" />
              </Link>
            </Notice>
          </div>
        </Section>
      </div>
    </PageContainer>
  );
}
