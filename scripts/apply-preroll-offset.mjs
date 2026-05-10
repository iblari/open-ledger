#!/usr/bin/env node

/**
 * apply-preroll-offset.mjs — Apply a pre-roll offset to a demo speech JSON file
 *
 * Adds the detected offset to every segment's `time` field so timestamps
 * become video-file-relative instead of speech-relative.
 *
 * Usage:
 *   node scripts/apply-preroll-offset.mjs <json-file> <offset-seconds>
 *
 * Idempotent: refuses to apply if _metadata.prerollOffsetApplied already exists.
 */

import { readFileSync, writeFileSync } from "fs";

const filePath = process.argv[2];
const offset = parseFloat(process.argv[3]);

if (!filePath || isNaN(offset)) {
  console.error("Usage: node scripts/apply-preroll-offset.mjs <json-file> <offset-seconds>");
  process.exit(1);
}

const raw = readFileSync(filePath, "utf-8");
const data = JSON.parse(raw);

// Idempotency check
if (data._metadata?.prerollOffsetApplied != null) {
  console.error(`ERROR: Offset already applied (${data._metadata.prerollOffsetApplied}s). Refusing to double-apply.`);
  console.error("  Remove _metadata.prerollOffsetApplied to re-apply.");
  process.exit(1);
}

if (!Array.isArray(data.segments) || data.segments.length === 0) {
  console.error("ERROR: No segments found in file.");
  process.exit(1);
}

const originalFirstTime = data.segments[0].time;

// Apply offset to every segment
for (const seg of data.segments) {
  seg.time = Math.round(seg.time + offset);
}

// Add metadata
data._metadata = {
  prerollOffsetApplied: offset,
  appliedAt: new Date().toISOString(),
  originalFirstSegmentTime: originalFirstTime,
};

// Verify monotonically increasing
for (let i = 1; i < data.segments.length; i++) {
  if (data.segments[i].time < data.segments[i - 1].time) {
    console.error(`ERROR: Non-monotonic time at segment ${i}: ${data.segments[i - 1].time} → ${data.segments[i].time}`);
    process.exit(1);
  }
}

writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");

console.log(`✓ Applied offset ${offset}s to ${data.segments.length} segments in ${filePath}`);
console.log(`  First segment: time ${originalFirstTime} → ${data.segments[0].time}`);
console.log(`  Last segment: time ${data.segments[data.segments.length - 1].time}`);
