// Lovable builds use Bun; do not block installs in CI.
// This script previously enforced npm, which prevents Lovable preview/publish.

const userAgent = process.env.npm_config_user_agent || '';
const execPath = process.env.npm_execpath || '';

const isNpm = userAgent.startsWith('npm/') || execPath.includes('npm');
const isBun = userAgent.startsWith('bun/') || execPath.includes('bun');

// Allow both npm (local dev) and bun (Lovable build infra).
if (!isNpm && !isBun) {
  const detected = userAgent.split(' ')[0] || execPath || 'unknown package manager';
  // Warn but do not fail the install.
  if (!process.env.CI) {
    console.warn(`Warning: package manager detected: ${detected}. Continuing install.`);
  }
}

