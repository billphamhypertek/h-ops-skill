import fs from 'node:fs';
import path from 'node:path';

export function copyFileTo(src, dest, { exec = false } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  if (exec) fs.chmodSync(dest, 0o755);
}

export function atomicWrite(dest, content) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, dest);
}
