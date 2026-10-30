// @effect-diagnostics nodeBuiltinImport:off - synchronous indexing runs inside a dedicated worker, outside the Effect runtime.
import { pinyin } from "pinyin-pro";
import * as NodeSqlite from "node:sqlite";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

function normalizeSpotlight(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}
function spotlightTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const run of text
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{Script=Han}]+|[a-z0-9]+/gu) ?? []) {
    if (/\p{Script=Han}/u.test(run)) {
      const chars = [...run];
      if (chars.length === 1) terms.add(run);
      for (let i = 0; i < chars.length - 1; i++) terms.add(chars.slice(i, i + 2).join(""));
    } else terms.add(run);
  }
  return [...terms];
}
function nearName(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0,
    j = 0,
    errors = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++errors > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return errors + (i < a.length || j < b.length ? 1 : 0) <= 1;
}
const pinyinCache = new Map<string, { full: string; initials: string }>();
function namePinyin(name: string) {
  let cached = pinyinCache.get(name);
  if (cached) return cached;
  const syllables = pinyin(name, { toneType: "none", type: "array", v: true })
    .map((s) => s.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);
  cached = {
    full: syllables.join("").toLowerCase(),
    initials: syllables
      .map((s) => s[0])
      .join("")
      .toLowerCase(),
  };
  pinyinCache.set(name, cached);
  return cached;
}
function quoteTerm(term: string) {
  return `"${term.replaceAll('"', '""')}"`;
}
function excerpt(text: string, query: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const terms = [query, ...spotlightTerms(query)].sort((a, b) => b.length - a.length);
  const first =
    terms.map((t) => flat.toLowerCase().indexOf(t.toLowerCase())).find((i) => i >= 0) ?? 0;
  const start = Math.max(0, first - 55),
    end = Math.min(flat.length, start + 236);
  return `${start ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}
interface SearchThread {
  id: string;
  projectId: string;
  title: string;
  projectTitle: string;
  updatedAt: string;
  archivedAt: string | null;
  createdBy: string;
  parent: string | null;
  continuation: string | null;
}
interface IndexedMessage {
  rowid: number;
  id: string;
  threadId: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  updatedAt: string;
}
export interface SpotlightMatch {
  threadId: string;
  projectId: string;
  source: "user" | "assistant";
  snippet: string;
  messageCreatedAt: string | null;
  messageId?: string;
  title: string;
  archivedAt: string | null;
  score: number;
  matchedQuery: string;
  familyKey: string;
  familyTitle: string;
  isSubagent: boolean;
  familyThreads: {
    threadId: string;
    title: string;
    updatedAt: string;
    archivedAt: string | null;
  }[];
}

// This database contains only a rebuildable index. The conversation database is always read-only.
export class SpotlightIndex {
  private readonly source: NodeSqlite.DatabaseSync;
  private readonly cache: NodeSqlite.DatabaseSync;
  private revision = -1;
  private readonly cachePath: string;
  private readonly aliasesPath: string | undefined;
  constructor(dbPath: string, cachePath: string, aliasesPath?: string) {
    this.aliasesPath = aliasesPath;
    this.cachePath = cachePath;
    this.source = new NodeSqlite.DatabaseSync(dbPath, { readOnly: true });
    this.source.exec("PRAGMA busy_timeout=5000");
    if (cachePath !== ":memory:")
      NodeFS.mkdirSync(NodePath.dirname(cachePath), { recursive: true, mode: 0o700 });
    this.cache = new NodeSqlite.DatabaseSync(cachePath);
    this.cache
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA journal_size_limit=33554432; PRAGMA max_page_count=49152;
      CREATE TABLE IF NOT EXISTS documents(rowid INTEGER PRIMARY KEY,id TEXT,threadId TEXT,role TEXT,text TEXT,terms TEXT,createdAt TEXT,updatedAt TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(terms,content='documents',content_rowid='rowid',tokenize='unicode61');
      CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON documents BEGIN INSERT INTO document_fts(rowid,terms) VALUES(new.rowid,new.terms); END;
      CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON documents BEGIN INSERT INTO document_fts(document_fts,rowid,terms) VALUES('delete',old.rowid,old.terms); END;
      CREATE TRIGGER IF NOT EXISTS docs_au AFTER UPDATE ON documents BEGIN INSERT INTO document_fts(document_fts,rowid,terms) VALUES('delete',old.rowid,old.terms); INSERT INTO document_fts(rowid,terms) VALUES(new.rowid,new.terms); END;`);
    if (cachePath !== ":memory:") NodeFS.chmodSync(cachePath, 0o600);
  }
  close() {
    this.cache.close();
    this.source.close();
  }
  private sync() {
    const change = Number(this.source.prepare("PRAGMA data_version").get()!.data_version);
    if (change === this.revision) return;
    const old = new Map(
      (
        this.cache.prepare("SELECT rowid,id,updatedAt FROM documents").all() as unknown as {
          rowid: number;
          id: string;
          updatedAt: string;
        }[]
      ).map((r) => [r.rowid, r]),
    );
    const current = this.source
      .prepare(
        `SELECT rowid,message_id AS id,thread_id AS threadId,role,created_at AS createdAt,updated_at AS updatedAt FROM orchestration_v2_projection_messages WHERE streaming=0 AND role IN ('user','assistant')`,
      )
      .all() as unknown as Omit<IndexedMessage, "text">[];
    const read = this.source.prepare(
      "SELECT json_extract(payload_json,'$.text') AS text FROM orchestration_v2_projection_messages WHERE rowid=? AND streaming=0",
    );
    const insert = this.cache.prepare(
      "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(rowid) DO UPDATE SET id=excluded.id,threadId=excluded.threadId,role=excluded.role,text=excluded.text,terms=excluded.terms,createdAt=excluded.createdAt,updatedAt=excluded.updatedAt",
    );
    this.cache.exec("BEGIN");
    try {
      for (const row of current) {
        const prev = old.get(row.rowid);
        old.delete(row.rowid);
        if (prev?.id === row.id && prev.updatedAt === row.updatedAt) continue;
        const text = read.get(row.rowid)?.text;
        if (typeof text !== "string") continue;
        insert.run(
          row.rowid,
          row.id,
          row.threadId,
          row.role,
          text,
          spotlightTerms(text).join(" "),
          row.createdAt,
          row.updatedAt,
        );
      }
      const del = this.cache.prepare("DELETE FROM documents WHERE rowid=?");
      for (const id of old.keys()) del.run(id);
      this.cache.exec("COMMIT");
      this.revision = change;
    } catch (e) {
      this.cache.exec("ROLLBACK");
      throw e;
    }
    if (this.cachePath !== ":memory:") {
      const bytes = ["", "-wal", "-shm"].reduce((n, s) => {
        try {
          NodeFS.chmodSync(this.cachePath + s, 0o600);
          return n + NodeFS.statSync(this.cachePath + s).size;
        } catch {
          return n;
        }
      }, 0);
      if (bytes > 256 * 1024 * 1024) throw new Error("Search index exceeded its 256 MiB budget");
    }
  }
  search(query: string, limit = 50): SpotlightMatch[] {
    this.sync();
    if (this.aliasesPath) {
      try {
        const aliases: unknown = JSON.parse(NodeFS.readFileSync(this.aliasesPath, "utf8"));
        if (Array.isArray(aliases)) {
          const alias = aliases
            .slice(0, 100)
            .find(
              (entry: unknown) =>
                typeof entry === "object" &&
                entry !== null &&
                "from" in entry &&
                "to" in entry &&
                typeof entry.from === "string" &&
                typeof entry.to === "string" &&
                entry.to.length >= 2 &&
                entry.to.length <= 200 &&
                normalizeSpotlight(entry.from) === normalizeSpotlight(query),
            );
          if (alias && typeof alias.to === "string") query = alias.to;
        }
      } catch {
        /* Missing or invalid optional aliases leave literal search available. */
      }
    }
    const threads = this.source
      .prepare(`SELECT t.thread_id AS id,t.project_id AS projectId,t.title,p.title AS projectTitle,t.updated_at AS updatedAt,t.archived_at AS archivedAt,json_extract(t.payload_json,'$.createdBy') AS createdBy,
      CASE WHEN json_extract(t.payload_json,'$.lineage.relationshipToParent')='subagent' THEN json_extract(t.payload_json,'$.lineage.parentThreadId') END AS parent,
      json_extract(t.payload_json,'$.continuedFromThreadId') AS continuation
      FROM orchestration_v2_projection_threads t JOIN projection_projects p ON p.project_id=t.project_id WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL`)
      .all() as unknown as SearchThread[];
    const byId = new Map(threads.map((t) => [t.id, t]));
    const family = (thread: SearchThread): SearchThread => {
      const seen = new Set<string>();
      let t = thread;
      while (!seen.has(t.id)) {
        seen.add(t.id);
        const parent = byId.get(t.parent ?? t.continuation ?? "");
        if (!parent) break;
        t = parent;
      }
      return t;
    };
    const continuationSuffix = /[（(]?\s*续[\d一二三四五六七八九十]*\s*[）)]?\s*$/u;
    const nameKey = (t: SearchThread) =>
      `${t.projectId}:${normalizeSpotlight(t.title.replace(continuationSuffix, ""))}`;
    const titledContinuations = new Set(
      threads.filter((t) => !t.parent && continuationSuffix.test(t.title)).map(nameKey),
    );
    const familyKey = (t: SearchThread) => {
      const root = family(t),
        key = nameKey(root);
      return titledContinuations.has(key) ? key : root.id;
    };
    const terms = spotlightTerms(query).slice(0, 40),
      norm = normalizeSpotlight(query);
    if (!terms.length || !norm) return [];
    const candidates = this.cache
      .prepare(
        `SELECT d.*,bm25(document_fts) AS lexical FROM document_fts JOIN documents d ON d.rowid=document_fts.rowid WHERE document_fts MATCH ? ORDER BY lexical LIMIT 600`,
      )
      .all(terms.map(quoteTerm).join(" OR ")) as unknown as (IndexedMessage & {
      terms: string;
      lexical: number;
    })[];
    const best = new Map<string, SpotlightMatch>();
    const contentScores = new Map<string, number>();
    const familyMembers = new Map<string, SearchThread[]>();
    for (const t of threads) {
      if (t.parent) continue;
      const key = familyKey(t);
      const list = familyMembers.get(key) ?? [];
      list.push(t);
      familyMembers.set(key, list);
    }
    const related = (t: SearchThread) =>
      (familyMembers.get(familyKey(t)) ?? [])
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 20)
        .map((m) => ({
          threadId: m.id,
          title: m.title,
          updatedAt: m.updatedAt,
          archivedAt: m.archivedAt,
        }));
    const result = (
      t: SearchThread,
      score: number,
      text: string,
      matchedQuery: string,
      msg?: IndexedMessage,
    ): SpotlightMatch => ({
      threadId: t.id,
      projectId: t.projectId,
      source: msg?.role ?? "user",
      snippet: excerpt(text, matchedQuery),
      messageCreatedAt: msg?.createdAt ?? null,
      ...(msg ? { messageId: msg.id } : {}),
      title: t.title,
      archivedAt: t.archivedAt,
      score,
      matchedQuery,
      familyKey: familyKey(t),
      familyTitle: family(t).title,
      isSubagent: t.parent !== null,
      familyThreads: related(t),
    });
    for (const t of threads) {
      const name = normalizeSpotlight(t.title),
        project = normalizeSpotlight(t.projectTitle);
      let score =
        name === norm
          ? 10000
          : name.startsWith(norm)
            ? 9000
            : name.includes(norm)
              ? 8500
              : project.includes(norm)
                ? 5000
                : 0;
      if (!score && /^[a-z]{2,}$/i.test(norm)) {
        const py = namePinyin(t.title);
        if (
          (norm.length >= 3 && py.full.includes(norm)) ||
          py.initials === norm ||
          (norm.length >= 3 && py.initials.includes(norm))
        )
          score = 6500;
      }
      if (score) best.set(t.id, result(t, score, t.title, query));
    }
    for (const m of candidates) {
      const t = byId.get(m.threadId);
      if (!t) continue;
      const text = normalizeSpotlight(m.text),
        tokens = new Set(m.terms.split(" "));
      const matched = terms.filter((term) => tokens.has(term));
      const coverage = matched.length / terms.length;
      const exact = text.includes(norm);
      const explicit = query.trim().split(/\s+/u);
      if (
        explicit.length > 1 &&
        !explicit.every((word) => normalizeSpotlight(m.text).includes(normalizeSpotlight(word)))
      )
        continue;
      if (
        !exact &&
        coverage < 0.65 &&
        !(
          terms.length >= 4 &&
          coverage >= 0.5 &&
          tokens.has(terms[0]!) &&
          tokens.has(terms.at(-1)!)
        )
      )
        continue;
      if (!exact && matched.length < 2 && terms.length > 1) continue;
      const titleMatches = [...m.text.matchAll(/[《「]([^》」\n]{2,60})[》」]/gu)];
      const titles = titleMatches.map((x) => normalizeSpotlight(x[1]!));
      const named = titles.some((name) => name.includes(norm));
      const alias = titles.some((name) => nearName(name.slice(0, norm.length), norm));
      const titleCoverage =
        terms.filter((term) => normalizeSpotlight(t.title).includes(term)).length / terms.length;
      const topic = titleCoverage >= 0.5 && norm.length >= 4 ? 1000 : 0;
      const occurrences = exact ? text.split(norm).length - 1 : 0;
      const base =
        (exact ? 3000 : alias ? 3000 : 1500) +
        coverage * 200 +
        (named || alias ? 1400 : 0) +
        topic +
        (m.role === "user" ? 120 : 0) +
        Math.min(occurrences, 5) * 25 +
        Math.min(-m.lexical * 20, 100);
      const previous = best.get(t.id);
      const aliasText = titleMatches.find((x) =>
        nearName(normalizeSpotlight(x[1]!).slice(0, norm.length), norm),
      )?.[1];
      const matchedQuery = m.text.toLowerCase().includes(query.toLowerCase())
        ? query
        : (aliasText ?? matched.toSorted((a, b) => b.length - a.length)[0] ?? query);
      const priorContent = contentScores.get(t.id) ?? -Infinity;
      if (
        base > priorContent ||
        (base === priorContent && m.createdAt > (previous?.messageCreatedAt ?? ""))
      ) {
        contentScores.set(t.id, base);
        best.set(t.id, result(t, Math.max(base, previous?.score ?? 0), m.text, matchedQuery, m));
      }
    }
    // Sustained work should outrank a recent conversation that only mentions the phrase once.
    const counts = new Map<string, number>();
    for (const m of candidates) {
      if (normalizeSpotlight(m.text).includes(norm))
        counts.set(m.threadId, (counts.get(m.threadId) ?? 0) + 1);
    }
    const sorted = [...best.values()]
      .map((r) => ({
        ...r,
        score:
          r.score +
          (r.messageId ? Math.min(Math.log2(1 + (counts.get(r.threadId) ?? 0)) * 100, 500) : 0) -
          (r.isSubagent ? 700 : 0) -
          (byId.get(r.threadId)?.createdBy === "system" && /^自动审批(?:\s|·)/u.test(r.title)
            ? 2000
            : 0),
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (byId.get(b.threadId)?.updatedAt ?? "").localeCompare(
            byId.get(a.threadId)?.updatedAt ?? "",
          ) ||
          a.threadId.localeCompare(b.threadId),
      );
    const perFamily = new Map<string, number>();
    const childCounts = new Map<string, number>();
    return sorted
      .filter((r) => {
        const n = perFamily.get(r.familyKey) ?? 0;
        const childCount = childCounts.get(r.familyKey) ?? 0;
        if (r.isSubagent && childCount >= 3) return false;
        if (n >= 8) return false;
        perFamily.set(r.familyKey, n + 1);
        if (r.isSubagent) childCounts.set(r.familyKey, childCount + 1);
        return true;
      })
      .slice(0, Math.min(limit, 50));
  }
}
