// Builds build/developer-keys-setup.exe (one file that installs Developer Keys for the
// current Windows user, see host/Installer.cs) and build/Developer Keys for Teams.zip.
// No dependencies beyond the .NET SDK and Node.
//   node scripts/release.mjs
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, cwd = root) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

run('npm run build', join(root, 'web'));
run('node teams/package.mjs');
run(
  'dotnet publish host -c Release -r win-x64 --self-contained true ' +
    '-p:PublishSingleFile=true -p:IncludeAllContentForSelfExtract=true -p:EnableCompressionInSingleFile=true ' +
    '-o release/publish',
);
// build/ holds the two files people download, and is committed with each release.
mkdirSync(join(root, 'build'), { recursive: true });
const setup = join(root, 'build', 'developer-keys-setup.exe');
copyFileSync(join(root, 'release', 'publish', 'developer-keys.Host.exe'), setup);
copyFileSync(join(root, 'teams', 'dist', 'developer-keys.zip'), join(root, 'build', 'Developer Keys for Teams.zip'));
console.log(`\nDone: ${setup} (${(statSync(setup).size / 1048576).toFixed(1)} MB) and build/Developer Keys for Teams.zip`);
