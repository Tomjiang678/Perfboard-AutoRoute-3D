#!/usr/bin/env node
/**
 * Pin-profile submission sink.
 *
 *   PIN_PROFILE_PORT=8099 PIN_PROFILE_DIR=/var/lib/protoroute/pin-profiles \
 *     node deploy/pin-profile-server.mjs
 *
 * Appends one JSON line per accepted submission to a daily file. It never logs
 * IP addresses, never stores anything but the part pinout payload, and rejects
 * oversized or malformed bodies. Merge submissions with:
 *   node tools/merge-pin-profiles.mjs --in <dir>
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PIN_PROFILE_PORT ?? 8099);
const DIR = process.env.PIN_PROFILE_DIR ?? path.join(process.cwd(), "pin-profiles");
const MAX_BODY = 8 * 1024;

const server = http.createServer((request, response) => {
  handle(request, response).catch(() => send(response, 500));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[pin-profile] listening on 127.0.0.1:${PORT}, dir=${DIR}`);
});

async function handle(request, response) {
  if (request.method === "GET" && request.url === "/health") {
    send(response, 204);
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/pin-profile") {
    send(response, 404);
    return;
  }

  let body;
  try {
    body = await readBody(request, MAX_BODY);
  } catch (error) {
    send(response, error && error.code === "BODY_TOO_LARGE" ? 413 : 400);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    send(response, 400);
    return;
  }
  if (!isSubmission(payload)) {
    send(response, 400);
    return;
  }

  const day = new Date().toISOString().slice(0, 10);
  await fs.mkdir(DIR, { recursive: true });
  const record = { receivedAt: new Date().toISOString(), ...payload };
  await fs.appendFile(path.join(DIR, `pin-profiles-${day}.jsonl`), `${JSON.stringify(record)}\n`, "utf8");
  send(response, 204);
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error("body too large");
        error.code = "BODY_TOO_LARGE";
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function isSubmission(value) {
  if (!value || typeof value !== "object" || value.kind !== "protoroute.pin-profile") return false;
  const profile = value.profile;
  if (!profile || typeof profile !== "object" || !profile.identity) return false;
  if (typeof profile.identity.value !== "string" || typeof profile.identity.package !== "string") return false;
  if (!Number.isInteger(profile.pinCount) || profile.pinCount < 2 || profile.pinCount > 256) return false;
  if (!Array.isArray(profile.pins) || profile.pins.length > 256) return false;
  return profile.pins.every((pin) => pin &&
    typeof pin === "object" &&
    Number.isInteger(pin.physical) &&
    pin.physical >= 1 &&
    pin.physical <= profile.pinCount &&
    (pin.connection === "netlist" || pin.connection === "bound" || pin.connection === "unconnected"));
}

function send(response, status) {
  response.writeHead(status);
  response.end();
}
