// AURA's browser Excel writer (apps/new-ui/src/lib/xlsx.ts), used by Scoops' export.
import { crc32 } from "node:zlib";
import { xlsx } from "../apps/new-ui/src/lib/xlsx";

let failed = 0;
const ok = (name: string, cond: boolean) => {
  if (!cond) failed++;
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}`);
};

const file = Buffer.from(xlsx("Scoops", ["Name", "Phone", "LinkedIn link"], [["=1+1 <A>", "+94 70 000 0001", "https://linkedin.com/in/a"]]));
const text = file.toString("utf8");
ok("a zip, closed by its directory", file.readUInt32LE(0) === 0x04034b50 && file.readUInt32LE(file.length - 22) === 0x06054b50);
const size = file.readUInt32LE(18);
const start = 30 + file.readUInt16LE(26);
ok("checksum matches the first file", crc32(file.subarray(start, start + size)) === file.readUInt32LE(14));
ok("phone kept as text with its +", text.includes('t="inlineStr" s="0"><is><t xml:space="preserve">+94 70 000 0001<'));
ok("typed formulas stay text, escaped", text.includes("=1+1 &lt;A&gt;") && !text.includes("<f>"));
ok("LinkedIn link clickable", text.includes('Target="https://linkedin.com/in/a" TargetMode="External"'));

console.log(`\nnewuixlsx: ${failed ? failed + " failed" : "passed"}`);
if (failed) process.exit(1);
