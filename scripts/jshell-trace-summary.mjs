import { promises as fs } from "node:fs";
import path from "node:path";

const TRACE_PATTERN = /^jshell-diagnostic-.*\.jsonl$/i;

const formatMs = (value) =>
  typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}ms` : "n/a";

const collectTraceCandidates = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectTraceCandidates(fullPath);
      }
      if (entry.isFile() && TRACE_PATTERN.test(entry.name)) {
        const stat = await fs.stat(fullPath);
        return [{ filePath: fullPath, mtimeMs: stat.mtimeMs }];
      }
      return [];
    })
  );
  return nested.flat();
};

const findLatestTraceFile = async (tmpDir) => {
  const candidates = await collectTraceCandidates(tmpDir);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].filePath;
};

const parseJsonl = (raw, filePath) => {
  const events = [];
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  lines.forEach((line, index) => {
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      throw new Error(
        `Invalid JSON at ${path.basename(filePath)}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
  return events;
};

const eventBy = (events, predicate) => events.find(predicate) ?? null;

const eventDuration = (events, predicate) => {
  const event = eventBy(events, predicate);
  return typeof event?.durationMs === "number" ? event.durationMs : null;
};

const collectProfiles = (events) =>
  Array.from(new Set(events.map((event) => event.profile))).filter(
    (profile) => profile !== "run" && profile !== "final"
  );

const summarizeProfile = (events, profile) => {
  const profileEvents = events.filter((event) => event.profile === profile);
  const startId =
    eventBy(profileEvents, (event) => event.phase === "start.total" && event.side === "rust")
      ?.commandId ?? null;
  const snapshotId =
    eventBy(
      profileEvents,
      (event) => event.commandId?.endsWith("-snapshot") && event.side === "rust" && event.phase === "total"
    )?.commandId ?? null;
  const warmupId =
    eventBy(
      profileEvents,
      (event) => event.commandId?.endsWith("-warmup") && event.side === "rust" && event.phase === "total"
    )?.commandId ?? null;

  const startTotal = startId
    ? eventDuration(profileEvents, (event) => event.commandId === startId && event.phase === "start.total")
    : null;
  const startSpawn = startId
    ? eventDuration(
        profileEvents,
        (event) => event.commandId === startId && event.phase === "start.process_spawn"
      )
    : null;
  const startHandshake = startId
    ? eventDuration(
        profileEvents,
        (event) => event.commandId === startId && event.phase === "start.bridge_handshake"
      )
    : null;

  const snapshotTotal = snapshotId
    ? eventDuration(
        profileEvents,
        (event) => event.commandId === snapshotId && event.side === "rust" && event.phase === "total"
      )
    : null;
  const snapshotRead = snapshotId
    ? eventDuration(
        profileEvents,
        (event) => event.commandId === snapshotId && event.side === "rust" && event.phase === "read"
      )
    : null;
  const snapshotBridgeTotal = snapshotId
    ? eventDuration(
        profileEvents,
        (event) => event.commandId === snapshotId && event.side === "bridge" && event.phase === "total"
      )
    : null;

  const warmupTotal = warmupId
    ? eventDuration(
        profileEvents,
        (event) => event.commandId === warmupId && event.side === "rust" && event.phase === "total"
      )
    : null;

  const snapshotGap =
    typeof snapshotRead === "number" && typeof snapshotBridgeTotal === "number"
      ? Math.round(snapshotRead - snapshotBridgeTotal)
      : null;

  return {
    profile,
    startTotal,
    startSpawn,
    startHandshake,
    snapshotTotal,
    snapshotRead,
    snapshotBridgeTotal,
    snapshotGap,
    warmupTotal
  };
};

const printSummary = (filePath, events) => {
  const mode = Array.from(new Set(events.map((event) => event.mode).filter(Boolean))).join(", ");
  const runIds = Array.from(new Set(events.map((event) => event.runId).filter(Boolean))).join(", ");
  const profiles = collectProfiles(events);
  const summaries = profiles.map((profile) => summarizeProfile(events, profile));

  console.log(`Trace file: ${filePath}`);
  console.log(`Events: ${events.length}`);
  console.log(`Mode: ${mode || "n/a"}`);
  console.log(`Run ID: ${runIds || "n/a"}`);
  console.log("");

  if (summaries.length === 0) {
    console.log("No profile events found.");
  } else {
    console.log("Profile summary:");
    summaries.forEach((entry) => {
      console.log(
        `- ${entry.profile}: start=${formatMs(entry.startTotal)} (spawn=${formatMs(entry.startSpawn)}, handshake=${formatMs(entry.startHandshake)}) | snapshot=${formatMs(entry.snapshotTotal)} (read=${formatMs(entry.snapshotRead)}, bridge=${formatMs(entry.snapshotBridgeTotal)}, gap=${entry.snapshotGap !== null ? `${entry.snapshotGap}ms` : "n/a"}) | warmup=${formatMs(entry.warmupTotal)}`
      );
    });
  }

  const top = events
    .filter(
      (event) =>
        typeof event?.durationMs === "number" &&
        event.durationMs > 0 &&
        event.profile !== "run" &&
        event.commandId !== "run-context"
    )
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  console.log("");
  console.log("Top 10 phases:");
  top.forEach((event, index) => {
    console.log(
      `${index + 1}. ${event.profile} | ${event.commandId} | ${event.side}.${event.phase} = ${Math.round(event.durationMs)}ms`
    );
  });
};

const main = async () => {
  const tmpDir = path.resolve(process.cwd(), "tmp");
  const latest = await findLatestTraceFile(tmpDir);
  if (!latest) {
    throw new Error(`No jshell diagnostic trace found in ${tmpDir}`);
  }

  const raw = await fs.readFile(latest, "utf8");
  const events = parseJsonl(raw, latest);
  printSummary(latest, events);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`jshell trace summary failed: ${message}`);
  process.exitCode = 1;
});
