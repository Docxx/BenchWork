import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('artifacts/benchwork-next/', root);
await mkdir(output, { recursive: true });
await copyFile(
  new URL('src-tauri/target/debug/benchwork.exe', root),
  new URL('BenchWork Next.exe', output),
);
await copyFile(
  new URL('src-tauri/target/debug/bundle/nsis/BenchWork Next_0.1.0_x64-setup.exe', root),
  new URL('BenchWork Next Setup.exe', output),
);
console.log(`BenchWork Next is ready in ${fileURLToPath(output)}`);
