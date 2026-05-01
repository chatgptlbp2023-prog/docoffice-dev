const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_STARTED_AT = new Date().toISOString();

let cachedPackageVersion = null;
let cachedGitMeta = null;

function readPackageVersion() {
  if (cachedPackageVersion) {
    return cachedPackageVersion;
  }

  try {
    const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    cachedPackageVersion = String(packageJson.version || '').trim() || '0.0.0';
  } catch {
    cachedPackageVersion = '0.0.0';
  }

  return cachedPackageVersion;
}

function readGitMeta() {
  if (cachedGitMeta) {
    return cachedGitMeta;
  }

  const envCommit = String(process.env.APP_GIT_COMMIT || process.env.GIT_COMMIT || '').trim();
  const envBranch = String(process.env.APP_GIT_BRANCH || process.env.GIT_BRANCH || '').trim();

  if (envCommit || envBranch) {
    cachedGitMeta = {
      commit: envCommit || 'unknown',
      branch: envBranch || 'unknown'
    };
    return cachedGitMeta;
  }

  try {
    const repoRoot = path.join(__dirname, '..', '..');
    const commit = execSync('git rev-parse --short HEAD', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();

    cachedGitMeta = {
      commit: commit || 'unknown',
      branch: branch || 'unknown'
    };
  } catch {
    cachedGitMeta = {
      commit: 'unknown',
      branch: 'unknown'
    };
  }

  return cachedGitMeta;
}

function getVersionInfo() {
  const gitMeta = readGitMeta();
  const buildTime = String(process.env.APP_BUILD_TIME || process.env.BUILD_TIME || '').trim();
  const releaseName = String(process.env.APP_RELEASE_NAME || '').trim();

  return {
    name: 'Foci App',
    version: readPackageVersion(),
    release: releaseName || null,
    commit: gitMeta.commit,
    branch: gitMeta.branch,
    builtAt: buildTime || null,
    startedAt: APP_STARTED_AT,
    environment: String(process.env.NODE_ENV || 'development').trim() || 'development'
  };
}

module.exports = {
  getVersionInfo
};
