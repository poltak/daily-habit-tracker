import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const { attrs, html, raw } = await import("../vanilla/site/js/dom.js");
const { THEME_BOOTSTRAP_SCRIPT } = await import("../lib/theme.ts");

test("markup templates escape journal text and keep nested markup", () => {
  assert.equal(String(html`<p>${'<img src=x onerror="alert(1)">'}</p>`), "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
  assert.equal(String(html`<a title="${`" onmouseover='x'`}">`), `<a title="&quot; onmouseover=&#39;x&#39;">`);
  assert.equal(String(html`<ul>${["a", "<b>"].map((item) => html`<li>${item}</li>`)}</ul>`), "<ul><li>a</li><li>&lt;b&gt;</li></ul>");
  assert.equal(String(html`<p>${null}${undefined}${false}${true}${0}</p>`), "<p>0</p>");
  assert.equal(String(html`<p>${raw("<i>x</i>")}</p>`), "<p><i>x</i></p>");
});

test("a line break between two tags adds no text, and a space on one line stays", () => {
  const markup = String(html`
    <div>
      <span>${"a"}</span> <span>b</span>
      ${"c"}
    </div>`);
  assert.equal(markup, "<div><span>a</span> <span>b</span>c</div>");
});

test("attributes follow the boolean rules of HTML and of ARIA", () => {
  assert.equal(String(attrs({ disabled: true, hidden: false, title: null, "aria-busy": false, "aria-pressed": true, "data-id": `a"b` })), ` disabled="" aria-busy="false" aria-pressed="true" data-id="a&quot;b"`);
});

test("the pages set the theme with the same script as the React layout", async () => {
  const signIn = await readFile(new URL("vanilla/site/sign-in.html", root), "utf8");
  assert.ok(signIn.includes(`<script>${THEME_BOOTSTRAP_SCRIPT}</script>`));
  const page = await readFile(new URL("vanilla/site/index.html", root), "utf8");
  assert.ok(page.includes(`<script>${THEME_BOOTSTRAP_SCRIPT}</script>`));
  assert.match(page, /class="journal-loading" aria-busy="true"/);
  assert.match(page, /aria-label="Primary navigation"/);
});

test("the build publishes plain modules only, and each page preloads the modules of its entry script", async () => {
  execFileSync(process.execPath, ["--no-warnings", fileURLToPath(new URL("vanilla/build.mjs", root))], { stdio: "ignore" });
  const dist = new URL("vanilla/dist/", root);
  const [build] = await readdir(new URL("b/", dist));
  const base = new URL(`b/${build}/`, dist);
  const modules = (await readdir(base, { recursive: true })).filter((file) => file.endsWith(".js")).map((file) => file.split("\\").join("/"));
  assert.ok(modules.includes("js/app.js") && modules.includes("lib/daylio.js"));
  const page = await readFile(new URL("index.html", dist), "utf8");
  assert.equal(page, await readFile(new URL("insights.html", dist), "utf8"));
  assert.doesNotMatch(page, /="\/assets\//);
  for (const file of modules) {
    const path = fileURLToPath(new URL(file, base));
    const source = await readFile(path, "utf8");
    // Node refuses a module that still has type annotations.
    execFileSync(process.execPath, ["--check", path]);
    assert.doesNotMatch(source, /from\s+["'][^"']+\.ts["']/, file);
    // The in-memory test store, the seed catalog and the framework stay out of the browser.
    assert.doesNotMatch(source, /Import would replace an entry|Move your body|from\s+["']react/, file);
    // Only the sign-in page needs its own script.
    assert.equal(page.includes(`<link rel="modulepreload" href="/b/${build}/${file}">`), file !== "js/sign-in.js", file);
  }
  // The sign-in page loads only what it needs: no journal code.
  const signIn = await readFile(new URL("sign-in.html", dist), "utf8");
  const signInModules = [...signIn.matchAll(/rel="modulepreload" href="\/b\/[^/]+\/([^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(signInModules, ["js/dom.js", "js/sign-in.js", "lib/passkey-client.js"]);
  assert.match(await readFile(new URL("_headers", dist), "utf8"), /\/sign-in\n {2}X-Frame-Options: DENY/);
});

test("no published file has a name that tracker blockers refuse", async () => {
  // Tracker filter lists block paths such as /log-view.js, and a blocked module stops the whole app.
  // Each pattern matches the start of a file name or a folder name.
  const blocked = /(^|\/)(log|logs|logger|logging|track|tracker|tracking|analytics|stats|beacon|pixel|ads?|advert)[-_./]/i;
  const dist = new URL("vanilla/dist/", root);
  for (const file of await readdir(dist, { recursive: true })) {
    assert.doesNotMatch(file.split("\\").join("/"), blocked, file);
  }
});

