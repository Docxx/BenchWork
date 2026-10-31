import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('@tauri-apps/cli/package.json')), 'tauri.js');
const artwork = JSON.parse(readFileSync(join(root, 'src/core/ui/brand/open-record.json'), 'utf8'));
const icons = join(root, 'src-tauri/icons');
const brand = join(root, 'assets/branding');
mkdirSync(brand, { recursive: true });
mkdirSync(join(root, 'public'), { recursive: true });

function svg({ tile = false, monochrome = false } = {}) {
  const blue = monochrome ? '#ffffff' : artwork.blue;
  const writing = monochrome ? '#ffffff' : artwork.writing;
  const trace = monochrome ? '#ffffff' : artwork.magenta;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 128 128">
  <title>BenchWork Open Record</title>
  <!-- Generated from src/core/ui/brand/open-record.json by pnpm branding. -->
  ${tile ? `<rect width="128" height="128" rx="28" fill="${artwork.background}"/>` : ''}
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${artwork.cover}" stroke="${blue}" stroke-width="6"/>
    <path d="${artwork.pages}" stroke="${blue}" stroke-width="6"/>
    <path d="${artwork.lines}" stroke="${writing}" stroke-width="4"/>
    <path d="${artwork.trace}" stroke="${trace}" stroke-width="4.5"/>
  </g>
</svg>
`.replace(/[ \t]+$/gm, '');
}

writeFileSync(join(icons, 'logo.svg'), svg({ tile: true }));
writeFileSync(join(root, 'public/favicon.svg'), svg({ tile: true }));
writeFileSync(join(brand, 'open-record.svg'), svg());
writeFileSync(join(brand, 'open-record-white.svg'), svg({ monochrome: true }));
writeFileSync(
  join(brand, 'navy-background.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${artwork.background}"/></svg>\n`,
);
writeFileSync(
  join(brand, 'icons.json'),
  JSON.stringify(
    {
      default: '../../src-tauri/icons/logo.svg',
      bg_color: artwork.background,
      android_bg: 'navy-background.svg',
      android_fg: 'open-record.svg',
      android_fg_scale: 85,
      android_monochrome: 'open-record-white.svg',
    },
    null,
    2,
  ) + '\n',
);

function tauri(args) {
  execFileSync(process.execPath, [cli, 'icon', ...args], { cwd: root, stdio: 'inherit' });
}
tauri(['assets/branding/icons.json', '--output', 'src-tauri/icons']);
// With an initialised mobile project, Tauri writes Android PNGs directly to
// its resource folder even when --output names the desktop icons directory.
const android = join(root, 'src-tauri/gen/android/app/src/main/res');
if (existsSync(android)) {
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    const folder = `mipmap-${density}`;
    const target = join(icons, 'android', folder);
    mkdirSync(target, { recursive: true });
    for (const name of [
      'ic_launcher.png',
      'ic_launcher_round.png',
      'ic_launcher_foreground.png',
      'ic_launcher_background.png',
      'ic_launcher_monochrome.png',
    ]) {
      copyFileSync(join(android, folder, name), join(target, name));
    }
  }
}
// Tauri leaves existing adaptive-icon XML in place; update its background and
// supply an Android 13 monochrome layer for launchers that theme icons.
const background = `<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">${artwork.background}</color></resources>\n`;
writeFileSync(join(icons, 'android/values/ic_launcher_background.xml'), background);
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>\n`;
writeFileSync(join(icons, 'android/mipmap-anydpi-v26/ic_launcher.xml'), adaptive);
mkdirSync(join(icons, 'android/mipmap-anydpi-v33'), { recursive: true });
writeFileSync(
  join(icons, 'android/mipmap-anydpi-v33/ic_launcher.xml'),
  adaptive.replace(
    '</adaptive-icon>',
    '  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n</adaptive-icon>',
  ),
);
tauri(['src-tauri/icons/logo.svg', '--output', 'assets/branding', '--png', '1024']);
copyFileSync(join(brand, '1024x1024.png'), join(icons, 'app-icon.png'));
copyFileSync(join(brand, '1024x1024.png'), join(root, 'src-tauri/app-icon.png'));

// Keep the Android project's XML in step with the generated icon set.
function copyTree(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory()) copyTree(join(source, entry.name), join(target, entry.name));
    else copyFileSync(join(source, entry.name), join(target, entry.name));
  }
}
if (existsSync(android)) copyTree(join(icons, 'android'), android);
console.log('Open Record branding and platform icons regenerated.');
