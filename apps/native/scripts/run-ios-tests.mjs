import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
}

if (process.platform !== 'darwin') {
  console.log('Skipping iOS native tests: Xcode tests require macOS.');
  process.exit(0);
}

const xcodebuildCheck = run('xcodebuild', ['-version']);
if (xcodebuildCheck.status !== 0) {
  console.log('Skipping iOS native tests: xcodebuild is unavailable on this machine.');
  process.exit(0);
}

let destination = process.env.IOS_TEST_DESTINATION;

if (!destination) {
  const simctl = run('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
  if (simctl.status === 0) {
    try {
      const parsed = JSON.parse(simctl.stdout);
      const devices = Object.values(parsed.devices ?? {})
        .flat()
        .filter(device => device.isAvailable !== false && /iPhone/i.test(device.name));

      const booted = devices.find(device => device.state === 'Booted');
      const preferred = booted ?? devices[0];
      if (preferred?.udid) {
        destination = `platform=iOS Simulator,id=${preferred.udid}`;
      }
    } catch {
      // fall through to default destination
    }
  }
}

destination ??= 'platform=iOS Simulator,name=iPhone 16,OS=latest';

const args = [
  'test',
  '-project',
  'ios/TwinTracker.xcodeproj',
  '-scheme',
  'TwinTracker',
  '-destination',
  destination,
  'CODE_SIGNING_ALLOWED=NO',
];

const result = spawnSync('xcodebuild', args, {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
