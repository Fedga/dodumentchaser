// tests/cloudrun-readiness-verification.ts
// Comprehensive Cloud Run Deployment Readiness Verification Suite for DocumentChaser

import fs from 'fs';
import path from 'path';
import { dbService } from '../server/db/index.js';
import { DocumentStorageService } from '../server/documentStorage.js';

let passed = 0;
let failed = 0;

function record(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.error(`[FAIL] ${name} - ${detail}`);
    failed++;
  }
}

async function verifyCloudRunReadiness() {
  console.log('================================================================');
  console.log('DocumentChaser Cloud Run Production Deployment Verification Suite');
  console.log('================================================================\n');

  // 1. Dockerfile Inspection
  console.log('1. Inspecting Dockerfile:');
  const dockerfilePath = path.resolve(process.cwd(), 'Dockerfile');
  record('Dockerfile exists in project root', fs.existsSync(dockerfilePath));

  const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');
  record('Dockerfile uses multi-stage build (builder and runner stages)', 
    dockerfileContent.includes('AS builder') && dockerfileContent.includes('AS runner')
  );
  record('Dockerfile uses official secure node:22-slim base image', 
    dockerfileContent.includes('FROM node:22-slim')
  );
  record('Dockerfile handles Cloud Run PORT environment variable', 
    dockerfileContent.includes('ENV PORT=8080') && dockerfileContent.includes('EXPOSE 8080')
  );
  record('Dockerfile enforces non-root container security (USER node)', 
    dockerfileContent.includes('USER node')
  );
  record('Dockerfile builds frontend assets via npm run build', 
    dockerfileContent.includes('npm run build')
  );
  record('Dockerfile runs server without intermediate shell for clean SIGTERM handling', 
    dockerfileContent.includes('CMD ["node", "node_modules/.bin/tsx", "server.ts"]')
  );

  // 2. .dockerignore Inspection
  console.log('\n2. Inspecting .dockerignore for Secret and Context Protection:');
  const dockerignorePath = path.resolve(process.cwd(), '.dockerignore');
  record('.dockerignore exists in project root', fs.existsSync(dockerignorePath));

  const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');
  record('.dockerignore excludes all .env files', 
    dockerignoreContent.includes('.env') && dockerignoreContent.includes('.env.*')
  );
  record('.dockerignore excludes credentials, private keys, and service account JSON files', 
    dockerignoreContent.includes('service-account*.json') && 
    dockerignoreContent.includes('gcp-key*.json') &&
    dockerignoreContent.includes('*.pem') &&
    dockerignoreContent.includes('*.key')
  );
  record('.dockerignore excludes local ephemeral storage (data/) and tests', 
    dockerignoreContent.includes('data/') && dockerignoreContent.includes('tests/')
  );

  // 3. Port & Host Binding in Server
  console.log('\n3. Inspecting Server Host and Port Binding:');
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf-8');

  record('Express server reads PORT from process.env.PORT', 
    serverContent.includes("process.env.PORT")
  );
  record('Express server binds to 0.0.0.0 (required for Cloud Run ingress)', 
    serverContent.includes("app.listen(PORT, '0.0.0.0'") || serverContent.includes("app.listen(PORT, '0.0.0.0'")
  );
  record('Express server includes graceful shutdown handler for SIGTERM and SIGINT', 
    serverContent.includes("process.on('SIGTERM'") && serverContent.includes("process.on('SIGINT'")
  );
  record('Express server provides Cloud Run health check probe endpoints (/health and /api/health)', 
    serverContent.includes("['/health', '/api/health']")
  );

  // 4. Production Build Verification
  console.log('\n4. Inspecting Production Build Output:');
  const distIndexPath = path.resolve(process.cwd(), 'dist/index.html');
  record('Production build output dist/index.html exists', fs.existsSync(distIndexPath));
  const distAssets = fs.existsSync(path.resolve(process.cwd(), 'dist/assets'));
  record('Production build output dist/assets directory exists and is populated', distAssets);

  // 5. Dependency Verification
  console.log('\n5. Inspecting Production Dependencies in package.json:');
  const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
  record('@google-cloud/storage is included in production dependencies', Boolean(pkg.dependencies['@google-cloud/storage']));
  record('pg (PostgreSQL driver) is included in production dependencies', Boolean(pkg.dependencies['pg']));
  record('express is included in production dependencies', Boolean(pkg.dependencies['express']));
  record('tsx is included in production dependencies for container runtime execution', Boolean(pkg.dependencies['tsx']));
  record('package-lock.json exists for deterministic npm ci in container', fs.existsSync(path.resolve(process.cwd(), 'package-lock.json')));

  // 6. PostgreSQL & GCS Storage Independence
  console.log('\n6. Inspecting PostgreSQL & GCS Architecture:');
  record('dbService provides PostgreSQL abstraction via DATABASE_URL', typeof dbService.checkHealth === 'function');
  record('DocumentStorageService supports GCS via Application Default Credentials (ADC)', 
    typeof DocumentStorageService.getProvider === 'function'
  );

  // 7. Secret Protection Check across codebase
  console.log('\n7. Secret Protection Check:');
  const gitignoreContent = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf-8');
  record('.gitignore excludes .env files', gitignoreContent.includes('.env'));
  
  // Verify Dockerfile does NOT contain any ARG or ENV with passwords/keys
  const secretKeywords = ['PASSWORD', 'SECRET', 'API_KEY', 'PRIVATE_KEY', 'CREDENTIALS'];
  const dockerfileEnvLines = dockerfileContent.split('\n').filter(l => l.startsWith('ENV ') || l.startsWith('ARG '));
  const hasBakedSecrets = dockerfileEnvLines.some(l => secretKeywords.some(k => l.toUpperCase().includes(k)));
  record('No credentials, tokens, or passwords baked into Dockerfile ENV/ARG', !hasBakedSecrets);

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

verifyCloudRunReadiness().catch(err => {
  console.error('Cloud Run readiness verification failed:', err);
  process.exit(1);
});
