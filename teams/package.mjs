// Builds teams/dist/developer-keys.zip (manifest + icons) for sideloading into Teams.
// No dependencies: the icons are teams/color.png and teams/outline.png, rendered
// from branding/*.svg, and the zip is written by hand.
//   node teams/package.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of files) {
    const packed = deflateRawSync(data), n = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, packed);
    centrals.push(central, n);
    offset += 30 + n.length + packed.length;
  }
  const dir = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const out = join(here, 'dist');
mkdirSync(out, { recursive: true });
const color = readFileSync(join(here, 'color.png'));
const outline = readFileSync(join(here, 'outline.png'));
writeFileSync(join(out, 'color.png'), color);
writeFileSync(join(out, 'outline.png'), outline);
writeFileSync(
  join(out, 'developer-keys.zip'),
  zip([['manifest.json', readFileSync(join(here, 'manifest.json'))], ['color.png', color], ['outline.png', outline]]),
);
console.log(`Wrote ${join(out, 'developer-keys.zip')}`);
