const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Build mount.js
console.log('1. Building mount.js...');
require('./build-mount.js');

// 2. Deploy Zalo Mini App
console.log('2. Deploying to Zalo Mini App (Testing)...');
try {
  const output = execSync('npx zmp-cli deploy -e -o public -t -m "Bun Mam Mien Tay POS"', {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  console.log(output);

  // Extract link: https://zalo.me/s/3906597427562388428/?env=TESTING...
  const match = output.match(/https:\/\/zalo\.me\/s\/\d+\/\?[^\s\r\n]+/);
  if (match) {
    const testUrl = match[0].trim();
    const targetFile = path.join(__dirname, '..', 'latest_zalo_test_url.txt');
    fs.writeFileSync(targetFile, testUrl, 'utf8');
    console.log('Saved latest Zalo test URL to latest_zalo_test_url.txt:', testUrl);
  }
} catch (err) {
  console.error('Deployment error:', err.stdout || err.message);
  process.exit(1);
}
