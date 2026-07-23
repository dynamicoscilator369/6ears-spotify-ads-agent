#!/usr/bin/env node

import { readFileSync } from "node:fs";

const usage = `Spotify Ads Agent operator client

Usage:
  node operator.mjs ARTIST_ID METHOD RESOURCE [JSON_FILE]

Environment:
  AGENT_BASE_URL   Worker origin, for example http://localhost:8787
  OPERATOR_API_KEY Bearer key; never passed on the command line
  OPERATOR_ACTOR   Verified operator identity injected into request bodies

Examples:
  node operator.mjs my-artist GET status
  node operator.mjs my-artist PUT profile examples/artist.profile.example.json
  node operator.mjs my-artist POST spotify/verify
  node operator.mjs my-artist POST actions action.json
  node operator.mjs my-artist POST actions/PROPOSAL_ID/approve approval.json
`;

function fail(message, code = 2) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(usage);
  process.exit(0);
}

const [, , artistId, rawMethod, resource, inputFile] = process.argv;
if (!artistId || !rawMethod || !resource) fail(usage);
if (artistId.length < 2 || artistId.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(artistId)) {
  fail("ARTIST_ID must be a lowercase slug from 2 to 63 characters.");
}
const method = rawMethod.toUpperCase();
if (!new Set(["GET", "POST", "PUT"]).has(method)) fail("METHOD must be GET, POST, or PUT.");
if (resource.startsWith("/") || resource.includes("..") || !/^[A-Za-z0-9_?=&%./-]+$/.test(resource)) {
  fail("RESOURCE must be a relative Agent API resource without '..'.");
}

const baseValue = process.env.AGENT_BASE_URL;
const operatorKey = process.env.OPERATOR_API_KEY;
const actor = process.env.OPERATOR_ACTOR;
if (!baseValue) fail("AGENT_BASE_URL is required.");
if (!operatorKey || operatorKey.length < 32) fail("OPERATOR_API_KEY must contain at least 32 characters.");
if (!actor || actor.trim().length < 2) fail("OPERATOR_ACTOR is required.");

let base;
try {
  base = new URL(baseValue);
} catch {
  fail("AGENT_BASE_URL must be a valid URL.");
}
if (base.protocol !== "http:" && base.protocol !== "https:") fail("AGENT_BASE_URL must use HTTP or HTTPS.");

let body;
if (method !== "GET") {
  let parsed = {};
  if (inputFile) {
    const source = inputFile === "-" ? readFileSync(0, "utf8") : readFileSync(inputFile, "utf8");
    try {
      parsed = JSON.parse(source);
    } catch {
      fail(`Could not parse JSON from ${inputFile}.`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      fail("Input JSON must be an object.");
    }
  }
  const payload = resource === "profile" && method === "PUT"
    ? { actor, profile: parsed }
    : { ...parsed, actor };
  body = JSON.stringify(payload);
}

const path = `/v1/artists/${encodeURIComponent(artistId)}/${resource}`;
const url = new URL(path, base);
const headers = new Headers({ Authorization: `Bearer ${operatorKey}`, Accept: "application/json" });
if (body !== undefined) headers.set("Content-Type", "application/json");

let response;
try {
  response = await fetch(url, { method, headers, ...(body === undefined ? {} : { body }) });
} catch (error) {
  fail(`Request did not complete: ${error instanceof Error ? error.message : "unknown network error"}`, 1);
}

const text = await response.text();
let output = text;
try {
  output = JSON.stringify(JSON.parse(text), null, 2);
} catch {
  // Preserve non-JSON diagnostic responses without exposing request headers.
}
process.stdout.write(`${output}\n`);
if (!response.ok) process.exit(1);
