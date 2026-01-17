const userAgent = process.env.npm_config_user_agent || '';
const execPath = process.env.npm_execpath || '';

const isNpm = userAgent.startsWith('npm/') || execPath.includes('npm');

if (!isNpm) {
  const detected = userAgent.split(' ')[0] || execPath || 'unknown package manager';
  console.error(
    `This project expects npm for installs to avoid bun-related timeouts. Detected: ${detected}`
  );
  console.error('Please use: npm install');
  process.exit(1);
}
