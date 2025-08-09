#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

console.log('Building Claude Code Router...');

try {
  // 确保dist目录存在
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }

  // Build the main CLI application
  console.log('Building CLI application...');
  execSync('npx esbuild src/cli.ts --bundle --platform=node --target=node18 --format=cjs --outfile=dist/cli.js --external:buffer --define:File=global.File --define:FormData=global.FormData --define:Blob=global.Blob --packages=external', { 
    stdio: 'inherit' 
  });
  
  // Ensure the CLI is executable
  const cliContent = fs.readFileSync('dist/cli.js', 'utf8');
  const shebang = '#!/usr/bin/env node\n';
  if (!cliContent.startsWith('#!')) {
    fs.writeFileSync('dist/cli.js', shebang + cliContent);
  }
  fs.chmodSync('dist/cli.js', 0o755);

  // Copy the tiktoken WASM file
  console.log('Copying tiktoken WASM file...');
  execSync('cp node_modules/tiktoken/tiktoken_bg.wasm dist/tiktoken_bg.wasm', { stdio: 'inherit' });

  // Build the UI
  console.log('Building UI...');
  if (!fs.existsSync('ui/node_modules')) {
    console.log('Installing UI dependencies...');
    execSync('cd ui && npm install', { stdio: 'inherit' });
  }
  execSync('cd ui && npm run build', { stdio: 'inherit' });

  // Copy the built UI index.html to dist
  console.log('Copying UI build artifacts...');
  execSync('cp ui/dist/index.html dist/index.html', { stdio: 'inherit' });

  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}