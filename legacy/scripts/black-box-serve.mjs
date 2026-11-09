#!/usr/bin/env node
// Serves the old app for the black-box tests in frontend/ (see
// frontend/playwright.config.ts). It builds the site when one of its inputs
// changed, gives each Worker an empty migrated D1 database, and starts two
// local Workers on the same build:
//
// - `owner`: sign-in is off (a request to localhost skips it), so each browser
//   is the signed-in owner. A test that starts signed in uses this one.
// - `passkey`: passkey sign-in on localhost (DAYMARK_LOCAL_PASSKEYS) with a
//   known setup code, for the sign-in tests.
//
// Both set DAYMARK_BLACK_BOX=true, which turns on the reset route in
// worker/black-box.ts. The fixture calls it before each test.
//
//   node scripts/black-box-serve.mjs --owner-port 4344 --passkey-port 4345
//
// The process stays in the foreground until Playwright stops it. It runs only
// local commands: `wrangler dev --local` and `wrangler d1 ... --local`.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLACK_BOX_DIRECTORY = path.join(root, ".wrangler", "black-box");
const HASH_FILE = path.join(BLACK_BOX_DIRECTORY, "input-hash");
const CONFIG = path.join("vanilla", "wrangler.jsonc");
const INPUT_DIRECTORIES = ["app", "lib", "public", "vanilla/site"];
const INPUT_FILES = ["vanilla/build.mjs"];
/** The setup code of the passkey Worker. The fixture reads the same value. */
const BLACK_BOX_SETUP_CODE = "black-box-setup-code";

const { values } = parseArgs({
  options: {
    "owner-port": { type: "string", default: "4344" },
    "passkey-port": { type: "string", default: "4345" },
  },
});

const WRANGLER = path.join(root, "node_modules", ".bin", "wrangler");
const toolEnv = { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: path.join(root, ".wrangler", "logs") };

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: ["ignore", "inherit", "inherit"], env: toolEnv });
}

/** Every file below a folder, sorted, so that the hash does not depend on the read order. */
function filesBelow(directory) {
  return readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}

function inputHash() {
  const hash = createHash("sha256");
  for (const file of [...INPUT_DIRECTORIES.flatMap(filesBelow), ...INPUT_FILES]) {
    hash.update(`${file}\n`);
    hash.update(readFileSync(path.join(root, file)));
  }
  return hash.digest("hex");
}

function buildWhenInputsChanged() {
  mkdirSync(BLACK_BOX_DIRECTORY, { recursive: true });
  const hash = inputHash();
  if (existsSync(HASH_FILE) && existsSync(path.join(root, "vanilla", "dist", "index.html")) && readFileSync(HASH_FILE, "utf8") === hash) {
    console.log("black-box-serve: the inputs did not change, so the build stays");
    return;
  }
  run("node", ["--no-warnings", "vanilla/build.mjs"]);
  writeFileSync(HASH_FILE, hash);
}

/** An empty database with each migration, in a folder of its own. Two runs on other ports do not share it. */
function prepareState(name) {
  const persistTo = path.join(BLACK_BOX_DIRECTORY, values["owner-port"], name);
  rmSync(persistTo, { recursive: true, force: true });
  run(WRANGLER, ["d1", "migrations", "apply", "DB", "--local", "--config", CONFIG, "--persist-to", persistTo]);
  return persistTo;
}

const children = new Map();
let stopping = false;

/**
 * Start a Worker with `wrangler dev --local`, and start it again when it
 * stops. The data stays in the persist folder, and the fixture retries its
 * reset while a Worker restarts.
 */
function startWorker({ name, port, vars, persistTo = prepareState(name) }) {
  const varArguments = Object.entries({ DAYMARK_BLACK_BOX: "true", ...vars }).flatMap(([key, value]) => ["--var", `${key}:${value}`]);
  const child = spawn(
    WRANGLER,
    ["dev", "--config", CONFIG, "--local", "--persist-to", persistTo, "--port", String(port), "--inspector-port", "0", ...varArguments],
    { cwd: root, stdio: ["ignore", "inherit", "inherit"], env: toolEnv },
  );
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(`black-box-serve: the ${name} Worker stopped (${signal ?? code}), so it starts again`);
    startWorker({ name, port, vars, persistTo });
  });
  children.set(name, child);
}

async function waitForWorker(port) {
  const url = `http://localhost:${port}/api/auth/status`;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      // A request that reaches the Worker while it starts can hang, so each try has a limit.
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.status < 500) return;
    } catch {
      // The Worker is not listening yet, or did not answer in time.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`black-box-serve: no answer from ${url}`);
}

function stop(code) {
  stopping = true;
  for (const child of children.values()) child.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));

buildWhenInputsChanged();
const ownerPort = Number(values["owner-port"]);
const passkeyPort = Number(values["passkey-port"]);
// Playwright waits for the passkey Worker, so the owner Worker must answer first.
startWorker({ name: "owner", port: ownerPort, vars: {} });
await waitForWorker(ownerPort);
startWorker({ name: "passkey", port: passkeyPort, vars: { DAYMARK_LOCAL_PASSKEYS: "true", DAYMARK_SETUP_CODE: BLACK_BOX_SETUP_CODE } });
await waitForWorker(passkeyPort);
console.log(`black-box-serve: owner on ${ownerPort}, passkey on ${passkeyPort}`);
