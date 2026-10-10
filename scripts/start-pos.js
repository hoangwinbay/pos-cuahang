const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const lower = name.toLowerCase();
    if (lower.includes('vmware') || lower.includes('virtual') || lower.includes('vbox')) continue;
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
          return net.address;
        }
      }
    }
  }
  return '192.168.10.58';
}

console.log('Dang khoi dong he thong May chu POS...');

// 1. Khoi dong server Node.js
const serverProc = spawn('node', ['server.js'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'pipe'
});

serverProc.stdout.on('data', (data) => {
  process.stdout.write(data);
});

serverProc.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// 2. Khoi dong Cloudflare Tunnel HTTPS
const cloudflaredPath = path.join(__dirname, '..', 'bin', 'cloudflared.exe');
let tunnelUrl = '';
let tunnelProc = null;

function printBanner() {
  const localIp = getLocalIp();
  console.log('\n' + '='.repeat(68));
  console.log('        HE THONG POS - BUN MAM MIEN TAY DA SAN SANG HOAT DONG!');
  console.log('='.repeat(68));
  console.log(' 1. LAPTOP QUAY THU NGAN (Mo trinh duyet tren laptop):');
  console.log('    -> http://localhost:3000\n');
  console.log(' 2. DIEN THOAI DUNG CHUNG WI-FI QUAN (Mo Safari/Chrome):');
  console.log(`    -> http://${localIp}:3000\n`);
  if (tunnelUrl) {
    console.log(' 3. DIEN THOAI CHAY ZALO MINI APP:');
    console.log('    -> Mo Mini App > Bam Bieu tuong Cai dat (banh rang hoac nut Cau hinh)');
    console.log('    -> Dan duong dan HTTPS sau vao o "Dia chi may chu POS":');
    console.log(`    -> ${tunnelUrl}`);
  }
  console.log('='.repeat(68) + '\n');
}

if (fs.existsSync(cloudflaredPath)) {
  console.log('Dang thiet lap duong truyen HTTPS bao mat cho Zalo Mini App...');
  tunnelProc = spawn(cloudflaredPath, ['tunnel', '--url', 'http://localhost:3000'], {
    cwd: path.join(__dirname, '..')
  });

  const handleTunnelData = (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !tunnelUrl) {
      tunnelUrl = match[0];
      // Luu vao file de tien tham chieu
      try {
        fs.writeFileSync(path.join(__dirname, '..', 'current_tunnel_url.txt'), tunnelUrl, 'utf8');
      } catch (e) {}
      printBanner();
    }
  };

  tunnelProc.stdout.on('data', handleTunnelData);
  tunnelProc.stderr.on('data', handleTunnelData);
} else {
  setTimeout(() => printBanner(), 1500);
}

process.on('SIGINT', () => {
  if (serverProc) serverProc.kill();
  if (tunnelProc) tunnelProc.kill();
  process.exit();
});
