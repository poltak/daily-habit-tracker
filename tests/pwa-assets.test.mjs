import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot));
}

test("favicon reuses the Daymark PWA artwork", async () => {
  assert.deepEqual(
    await readProjectFile("public/favicon.svg"),
    await readProjectFile("public/icon.svg"),
  );
});

test("both app brand marks use the canonical vector asset", async () => {
  const page = (await readProjectFile("app/page.tsx")).toString();
  const icon = (await readProjectFile("public/icon.svg")).toString();
  const styles = (await readProjectFile("app/globals.css")).toString();

  assert.equal((page.match(/<span className="brand-mark" aria-hidden="true" \/>/g) ?? []).length, 2);
  assert.match(styles, /\.brand-mark \{[^}]*background: url\("\/icon\.svg"\) center \/ contain no-repeat;/s);
  assert.doesNotMatch(page, /className="brand-mark">d<\//);
  assert.doesNotMatch(icon, /<text\b|font-family=/i);
  assert.match(icon, /#E78363/);
  assert.match(icon, /#FFFFFF/);
  assert.match(styles, /\.brand-mark \{[^}]*width: 34px;[^}]*height: 34px;[^}]*box-shadow: var\(--accent-shadow\);/s);
  assert.match(styles, /\.app-loading \.brand-mark \{ width: 48px; height: 48px; \}/);
  assert.match(styles, /\.brand-mark \{ width: 30px; height: 30px; \}/);
});

function readPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(buffer.subarray(0, signature.length), signature);

  const chunks = [];
  let offset = signature.length;
  while (offset < buffer.length) {
    assert.ok(offset + 12 <= buffer.length, "PNG chunk is truncated");
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert.ok(dataEnd + 4 <= buffer.length, `PNG ${type} chunk is truncated`);
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }

  assert.equal(offset, buffer.length, "PNG has unexpected trailing data");
  assert.equal(chunks.at(-1)?.type, "IEND");
  const header = chunks.find(({ type }) => type === "IHDR")?.data;
  assert.ok(header && header.length === 13, "PNG has a valid IHDR chunk");

  return {
    chunks,
    width: header.readUInt32BE(0),
    height: header.readUInt32BE(4),
    bitDepth: header[8],
    colorType: header[9],
    interlaceMethod: header[12],
  };
}

function decodeRgbPng(png) {
  assert.equal(png.bitDepth, 8);
  assert.equal(png.colorType, 2, "maskable PNG must be opaque RGB");
  assert.equal(png.interlaceMethod, 0, "maskable PNG must not be interlaced");

  const compressed = Buffer.concat(png.chunks.filter(({ type }) => type === "IDAT").map(({ data }) => data));
  const scanlines = inflateSync(compressed);
  const bytesPerPixel = 3;
  const rowLength = png.width * bytesPerPixel;
  const rows = [];
  let offset = 0;

  for (let y = 0; y < png.height; y += 1) {
    const filter = scanlines[offset];
    offset += 1;
    const row = Buffer.from(scanlines.subarray(offset, offset + rowLength));
    offset += rowLength;
    const previous = rows[y - 1];

    for (let x = 0; x < row.length; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const above = previous?.[x] ?? 0;
      const upperLeft = x >= bytesPerPixel ? (previous?.[x - bytesPerPixel] ?? 0) : 0;
      if (filter === 1) row[x] = (row[x] + left) & 0xff;
      else if (filter === 2) row[x] = (row[x] + above) & 0xff;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + above) / 2)) & 0xff;
      else if (filter === 4) {
        const estimate = left + above - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const aboveDistance = Math.abs(estimate - above);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        const predictor = leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
          ? left
          : aboveDistance <= upperLeftDistance ? above : upperLeft;
        row[x] = (row[x] + predictor) & 0xff;
      } else assert.equal(filter, 0, `unsupported PNG filter ${filter}`);
    }
    rows.push(row);
  }

  assert.equal(offset, scanlines.length, "PNG scanlines have unexpected trailing data");
  return (x, y) => {
    const row = rows[y];
    const index = x * bytesPerPixel;
    return [...row.subarray(index, index + bytesPerPixel)];
  };
}

test("manifest declares installable PWA icons with stable identity", async () => {
  const manifest = JSON.parse(await readProjectFile("public/manifest.webmanifest"));
  assert.equal(manifest.id, "/");

  const icons = new Map(manifest.icons.map((icon) => [icon.src, icon]));
  assert.deepEqual(icons.get("/icon-192.png"), {
    src: "/icon-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  });
  assert.deepEqual(icons.get("/icon-512.png"), {
    src: "/icon-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  });
  assert.deepEqual(icons.get("/icon-maskable-512.png"), {
    src: "/icon-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  });
  assert.deepEqual(icons.get("/icon.svg"), {
    src: "/icon.svg",
    sizes: "any",
    type: "image/svg+xml",
    purpose: "any",
  });
  assert.equal(manifest.icons.filter((icon) => icon.purpose === "maskable").length, 1);
  assert.ok(manifest.icons.every((icon) => !icon.purpose.includes("any maskable")));
});

test("PWA PNG assets have valid signatures and exact dimensions", async () => {
  const expected = [
    ["public/icon-192.png", 192, 192],
    ["public/icon-512.png", 512, 512],
    ["public/icon-maskable-512.png", 512, 512],
  ];

  for (const [path, width, height] of expected) {
    const png = readPng(await readProjectFile(path));
    assert.equal(png.width, width, `${path} width`);
    assert.equal(png.height, height, `${path} height`);
    assert.equal(png.colorType, 2, `${path} must be an opaque RGB PNG`);
    assert.ok(png.chunks.some(({ type }) => type === "IDAT"), `${path} has image data`);
  }
});

test("maskable PWA icon is opaque with the expected background at its corners", async () => {
  const png = readPng(await readProjectFile("public/icon-maskable-512.png"));
  const pixel = decodeRgbPng(png);
  const expectedBackground = [231, 131, 99];
  for (const point of [[0, 0], [511, 0], [0, 511], [511, 511]]) {
    assert.deepEqual(pixel(...point), expectedBackground, `maskable corner ${point.join(",")}`);
  }
});

test("layout emits one credentialed manifest link and no metadata manifest", async () => {
  const layout = (await readProjectFile("app/layout.tsx")).toString();
  assert.equal((layout.match(/rel="manifest"/g) ?? []).length, 1);
  assert.match(layout, /<link rel="manifest" href="\/manifest\.webmanifest" crossOrigin="use-credentials" \/>/);
  assert.doesNotMatch(layout, /^\s*manifest\s*:/m);
});

test("service-worker shell caches the versioned PWA assets", async () => {
  const serviceWorker = (await readProjectFile("public/sw.js")).toString();
  assert.match(serviceWorker, /daymark-shell-v3/);
  for (const asset of ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"]) {
    assert.match(serviceWorker, new RegExp(`"${asset.replaceAll(".", "\\.")}"`));
  }
});
