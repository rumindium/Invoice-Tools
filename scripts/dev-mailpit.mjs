#!/usr/bin/env node
/**
 * Starts Mailpit next to `npm run dev` so every auth email lands in a local inbox.
 * Reuses an already listening SMTP port, otherwise runs the container and waits
 * until it accepts connections.
 */
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const SMTP_PORT = Number(process.env['MAILPIT_SMTP_PORT'] ?? 1025);
const UI_PORT = Number(process.env['MAILPIT_UI_PORT'] ?? 8025);
const CONTAINER = process.env['MAILPIT_CONTAINER'] ?? 'rinv-mailpit';
const IMAGE = process.env['MAILPIT_IMAGE'] ?? 'axllent/mailpit:latest';

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForSmtp(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await portOpen(SMTP_PORT)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return false;
}

function prefix(stream, write) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) {
        write(`[mail] ${line}`);
      }
    }
  });
}

async function main() {
  if (await portOpen(SMTP_PORT)) {
    console.log(`Mailpit is already listening — inbox: http://localhost:${UI_PORT}`);
    return;
  }

  const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
  });

  if (docker.status !== 0) {
    console.error(
      'Mailpit is not running and Docker is unavailable.\n' +
        `Start an SMTP server on port ${SMTP_PORT} or install Docker, then run npm run dev again.`,
    );
    process.exit(1);
  }

  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });

  const child = spawn(
    'docker',
    [
      'run',
      '--rm',
      '--name',
      CONTAINER,
      '-p',
      `127.0.0.1:${SMTP_PORT}:1025`,
      '-p',
      `127.0.0.1:${UI_PORT}:8025`,
      IMAGE,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  prefix(child.stdout, (line) => console.log(line));
  prefix(child.stderr, (line) => console.error(line));

  const stop = () => {
    child.kill('SIGTERM');
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  if (await waitForSmtp()) {
    console.log(`Mailpit ready — SMTP 127.0.0.1:${SMTP_PORT}, inbox http://localhost:${UI_PORT}`);
  } else {
    console.error(`Mailpit did not open SMTP port ${SMTP_PORT} within 60s.`);
  }
}

void main();
