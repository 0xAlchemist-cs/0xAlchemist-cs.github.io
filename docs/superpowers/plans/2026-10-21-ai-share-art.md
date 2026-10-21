# Full-content AI Share Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supply an author-operated Codex workflow that packages complete local content, creates illustrated candidates, records explicit approval, and publishes the exact approved PNG through the existing sharing metadata pipeline.

**Architecture:** Separate source/approval validation, author commands, and static-site integration. Codex reads the complete prepared input and uses the built-in image generator outside CI; the author reviews the composed candidate before it can enter `assets/share-art`. The static build validates approved resources and emits their exact bytes, retaining the original deterministic template for unconfigured content.

**Tech Stack:** Existing Node 22.22.0, TypeScript strict, Astro, YAML/Zod, Sharp and bundled Noto Sans CJK SC. No new dependencies.

## Global Constraints

- Binding design: `docs/superpowers/specs/2026-10-21-ai-share-art-design.md`, approved 2026-10-21. Keep existing article text, reading UI, particle background, search verification, production visibility, and zero new paid API dependencies.
- Work on existing `codex/search-sharing-v12`; PR #7 remains unmerged. Candidate approval and merge approval are separate. Never register the real sample as approved before its author confirms it.
- No model API calls, API keys, or network in Astro, CLI, tests, browser, or CI. Actual generation is exclusively the Codex built-in image tool invoked by the controller.
- Final selected PNG is 1200×630; build must output its exact bytes without re-layout. OG, Twitter and article JSON-LD share that image. Body cover stays independent.
- All paths are root constrained, local, and symlink checked; reject traversal and corrupted explicit configuration. No approved manifest means template fallback. A stale source digest warns and retains the approved image.
- Normalize source CRLF to LF and hash the complete raw Markdown/MDX including frontmatter. Track all local project-linked article dependencies. Do not silently truncate input.
- Candidates live only in ignored `reports/share-art/`. Selected artwork, final PNG, brief and layout live in non-served `assets/share-art/<kind>/<slug>/`, with digest validation and recorded explicit approval. Preserve prior selected assets during iteration.
- Use test-first behavior assertions, record meaningful RED and GREEN commands/results; an import or sandbox startup error alone does not demonstrate a behavioral RED. Windows local and Ubuntu CI must work. Reports never claim actual generated images came from automated tests.
- Implementers do not commit shared-tree changes; root stages task-owned paths after tests/review. Implementation tasks run sequentially; image creation by the controller may proceed while a single implementer works.

## File map

- `src/lib/share-art.ts`: content snapshots, manifest schema and validation, approved asset loading.
- `scripts/share-art.ts`: author command parsing and orchestration; `scripts/share-art-workflow.ts`: candidate composition, import and re-review operations.
- `src/lib/render-social-card.ts`: export verified font and text-rendering helpers only as needed by author composition; original template behavior remains covered.
- `src/lib/social-card.ts`, content detail pages, OG endpoint: resolve optional approved art and route its exact bytes.
- `scripts/sharing-audit.ts`: display and validate source/approval/review status and emitted image bytes.
- `tests/share-art.test.ts`, `tests/share-art-workflow.test.ts`, browser fixture/spec: meaningful lifecycle and integration coverage.
- `CONTENT_GUIDE.md`, `README.md`, `DEPLOYMENT.md`: commands and author workflow.

### Task 1: Complete source snapshots and approved asset validation

**Files:** Create `src/lib/share-art.ts`, `tests/share-art.test.ts`. Do not change existing schemas or author content.

**Constraints:** Apply every Global Constraint above. Use local root parameters in tests, no process.cwd mutation. No real asset is approved by this task.

**Interfaces:** Export the following named contracts; use Zod for a strict versioned manifest:

```ts
type ShareArtTarget = { kind: 'blog' | 'projects'; slug: string };
type ShareArtSource = { path: string; sha256: string; text: string };
type ShareArtSources = ShareArtTarget & {
  title: string; sources: ShareArtSource[]; sourceDigest: string;
};
type ArtFile = { file: string; sha256: string };
type ShareArtManifest = {
  version: 1; target: ShareArtTarget;
  sources: { path: string; sha256: string }[]; sourceDigest: string;
  image: ArtFile; artwork: ArtFile; brief: ArtFile; layout: ArtFile;
  alt: string; generator: { tool: string; model?: string };
  approval: { confirmed: true; record: string };
};
type ApprovedShareArt = {
  manifest: ShareArtManifest; png: Buffer;
  status: 'current' | 'needs_review'; currentSourceDigest: string;
};
readArtSources(target: ShareArtTarget, root?: string): Promise<ShareArtSources>;
readApprovedShareArt(target: ShareArtTarget, root?: string): Promise<ApprovedShareArt | null>;
shareArtManifestSchema; // exported schema and inferred ShareArtManifest type
sourceDigest(sources: {path:string;sha256:string}[]): string;
safeArtFile(root: string, directory: string, filename: string): Promise<string>;
```

`root` defaults to process.cwd(). Source paths use forward slashes relative to root. Look up frontmatter slugs, including nested `.md/.mdx`, rather than assuming filenames. Reject duplicate slugs. Use existing schema semantics for matching project-related articles (both explicit relatedPosts and matching relatedRepos). Source walking must never follow symbolic links. `sourceDigest` sorts and hashes JSON of path/digest records, rejecting duplicates/unsafe paths. `safeArtFile` constrains directory inside root and filenames to a single safe leaf, validates every path component without following links. All four manifest files must exist and match SHA256; final PNG must fully decode to 1200×630. Verify manifest target and its stored aggregate. Missing manifest alone means unconfigured; other read/schema/decode/hash errors fail. Current-source digest mismatch yields needs_review, not replacement or rejection.

- [ ] Write fixtures with same blog/project slug, nested content, two linked articles and a long-tail marker; assert the prepared text includes the marker and all raw frontmatter.

```ts
assert.equal(
  snapshot.sources.some((s) => s.text.endsWith('FULL_TEXT_TAIL')),
  true,
);
assert.equal(lf.sourceDigest, crlf.sourceDigest);
assert.notEqual(before.sourceDigest, afterLinkedArticleChange.sourceDigest);
assert.equal(await readApprovedShareArt(target, root), null);
```

- [ ] Run the new tests, record the expected behavioral failures before implementation. Implement source loading and manifest validation. Cover digest/target/dimension/corruption/approval/alt failures and symlink escape. Synthetic fixtures explicitly identify generator as test-fixture, never claim model invocation.

```ts
assert.equal(approved.status, 'current');
assert.deepEqual(approved.png, selectedFinalBytes);
assert.equal(afterEdit.status, 'needs_review');
await assert.rejects(() => readApprovedShareArt(unsafeTarget, root));
```

- [ ] Run `node --import tsx --test tests/share-art.test.ts`, then original `tests/social-card.test.ts`; inspect results and self-review. Write task report with RED/GREEN evidence and exact exports. Root commits task-owned files after task review.

### Task 2: Author commands, candidate composition, approval and re-review

**Files:** Create `scripts/share-art.ts`, `scripts/share-art-workflow.ts`, `tests/share-art-workflow.test.ts`. Modify `src/lib/render-social-card.ts`, `package.json`, `scripts/project.ps1`, `CONTENT_GUIDE.md`, `README.md`, `DEPLOYMENT.md` as needed. Do not change the dependency lockfile or author content.

**Constraints:** Apply every Global Constraint above. Read Task 1 exports from `src/lib/share-art.ts`. Candidate creation never updates approved assets. No model call is possible from these commands. All destructive/replacement mutations are constrained and deliberate; preserve old asset files.

**Interfaces and CLI:** Add npm task `share-art` and allow it in the PowerShell project launcher. Export testable workflow operations from the workflow module; the CLI only dispatches them. Exact user command forms:

```text
share-art prepare blog/no-need-to-be-the-sun --out reports/share-art/blog/no-need-to-be-the-sun/v1
share-art compose --bundle <directory> --artwork <local-file> --brief <local-markdown> --layout <local-json> --tool image_gen
share-art approve --candidate <directory> --confirmation <author-confirmation-record>
share-art review blog/no-need-to-be-the-sun --confirmation <author-confirmation-record>
```

Prepare writes full `input.md` with every source, a snapshot JSON (sources without text and sourceDigest), brand information and guide for Codex to write a real brief after reading. A new output directory is required; never overwrite prior bundle/candidates. Read-only external local artwork/brief/layout inputs can be copied, but generated files stay under `reports/share-art` until approval. Compose writes normalized copied artwork, brief, layout, candidate final PNG and a candidate record with target, source snapshot, all digests and tool name (model only when actually supplied). Candidate record contains no confirmed approval. Create a new versioned candidate subdirectory on every compose, preserving prior preview.

Layout JSON is version 1 and contains `title`, `author`, `site` text boxes, each `{left,top,width,height,fontSize,color}`; no user-supplied text. Text values come from target full title and site config. Validate boxes fit the 1200×630 canvas, positive bounded sizes and valid hex colors. Use the already verified bundled font, escaped Pango, bound text to each box (shrink/wrap as required, no overflow); do not reuse the large white template background. Sharp can normalize the input raster and composite accurate text during candidate creation only. Expose minimal font/text helpers from existing renderer; preserve original card output behavior and tests.

Approve requires explicit nonempty `--confirmation`, validates all candidate digests and current source snapshot, rejects stale candidates, and copies exact final/art/brief/layout bytes to digest-named files under `assets/share-art/<kind>/<slug>/`. Only then write a strict approved manifest atomically, leaving previously approved files untouched. No silent approval from file existence, candidate creation or tests. Review re-validates an existing approval, reads current sources, updates source/review confirmation while preserving exact PNG bytes. Both writer paths reject symlink/traversal directories and mismatched target. Repeating commands must not destroy previous files.

- [ ] Test prepare with a raw long-content marker and verify no approved directory is created; test compose with a synthetic raster and escaped/mixed-language text. Use a copied real bundled font in temporary roots for realistic rendering.

```ts
assert.equal(await exists(approvedManifestPath), false);
assert.equal((await sharp(candidatePng).metadata()).width, 1200);
assert.equal((await sharp(candidatePng).metadata()).height, 630);
assert.deepEqual(approved.png, candidateBytes);
```

- [ ] Record a real failing approval/lifecycle assertion, implement workflow, and cover no-confirmation/stale/tamper/unsafe path rejection, preserving old selected bytes on replacement and review. Test tool metadata does not invent a model name. Run new workflow tests and prior library/renderer tests.
- [ ] Document realistic PowerShell examples, Codex-only generation boundary, full-text reading, accurate typography, candidate confirmation, image replacement and source review. Root writes the actual essay brief and generates the real sample separately; do not fabricate or approve it.
- [ ] Write task report with test evidence, command API and concerns; root commits owned files after task review.

### Task 3: Static integration, independent audit and release evidence

**Files:** Modify `src/lib/social-card.ts`, `src/pages/og/[...image].png.ts`, `src/pages/blog/[slug].astro`, `src/pages/projects/[slug].astro`, `scripts/sharing-audit.ts`, `scripts/prepare-browser-build.ts`, `tests/social-card.test.ts`, `tests/sharing-audit.test.ts`, `tests/browser/sharing.spec.ts`; add focused integration tests if necessary. Preserve prior template APIs and author content.

**Constraints:** Apply every Global Constraint above. Read Task 1 and Task 2 contracts. The real essay candidate has no author approval yet and remains only under reports; production still uses template fallback until approval.

**Interfaces:** Retain synchronous `postCard`/`projectCard` for unconfigured template cards, add async `resolveSocialCard(card: SocialCard, root?:string): Promise<SocialCard>` plus a build-only optional approved-art descriptor on SocialCard. Resolve approved art using Task 1, use approved alt, and compute a stable new URL hash covering final bytes and confirmed design versions. Both detail pages and endpoint path generation call resolver consistently. Endpoint returns exact validated approved PNG when configured, otherwise existing template render. Keep buffers/paths out of emitted HTML except the public image URL.

Extend sharing report cards with art status `{source:'template'|'ai', approval:'not_configured'|'confirmed', review:'not_required'|'current'|'needs_review'}`. Map only visible source content to audit pages. Allow an optional author root in audit options for independent fixtures. Audit compares emitted PNG SHA256 to the selected final PNG (independently of URL naming), reports stale source warnings, and errors on invalid explicit config. Existing generic metadata/image/verification checks remain. Offline HTML and Markdown show source and review state without publishing brief, prompt, source text or internal paths into dist. Ensure candidates and hidden assets cannot generate public OG files.

- [ ] Add behavioral tests before resolver/integration: expected AI endpoint bytes and URL should differ from the old template, all image metadata must use approved alt and the same URL; editing artwork changes URL, editing source only warns. Record RED then GREEN.

```ts
assert.deepEqual(builtPng, approvedFinalPng);
assert.equal(ogUrl, twitterUrl);
assert.equal(ogUrl, blogPostingImage);
assert.match(staleAudit.warnings.join('\n'), /复核|review/i);
```

- [ ] In the disposable browser fixture only, create a clearly marked synthetic test approval for the visible integration article and verify emitted exact bytes, metadata/cover independence and privacy canaries. Retain fallback tests for other content; never register a real approval for the sample. Avoid changing the canonical content to manufacture tests.
- [ ] Run focused tests, root full `verify`, rebuilt sharing browser tests and appropriate full browser regression. Inspect real desktop/mobile candidate and existing real content preview. Font/brief/source/candidate canaries and hidden OG paths must not leak into dist, Sitemap, Pagefind or RSS.
- [ ] Write task report, then root commits reviewed changes, updates PR #7 with sample preview instructions and checks, pushes, verifies same-head Ubuntu CI and downloads card evidence. User confirms sample before approval-import; user confirms merge separately. No merge/deploy in this implementation turn absent that confirmation.

## Controller-owned real sample and final gate

- [ ] Read the full essay, save a content-specific brief under `reports/share-art`, invoke the built-in image tool for artwork with a calm blue/cream editorial composition. Read the imagegen skill and use the actual image tool; do not substitute a vector mock for generated art.
- [ ] Once author commands exist, prepare the real bundle, compose title/author/site with the verified font, visually inspect and expose the exact final 1200×630 candidate. Save prompt and tool provenance without claiming an unreported model name. Do not run approve before the author confirms that candidate.
- [ ] Complete task and whole-branch review, keep durable test/CI evidence, update PR and show the candidate to author. Ask only for the concrete candidate approval, with merge approval remaining explicit.
