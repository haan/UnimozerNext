import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const readText = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const readJson = (relativePath) => JSON.parse(readText(relativePath));

const readCargoPackageVersion = () => {
  const cargoToml = readText("src-tauri/Cargo.toml");
  const packageSectionMatch = cargoToml.match(
    /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m
  );
  if (!packageSectionMatch) {
    throw new Error("Could not read package version from src-tauri/Cargo.toml");
  }
  return packageSectionMatch[1];
};

const readCargoLockPackageVersion = () => {
  const cargoLock = readText("src-tauri/Cargo.lock");
  const packageMatch = cargoLock.match(
    /\[\[package\]\]\s+name\s*=\s*"unimozer-next"\s+version\s*=\s*"([^"]+)"/m
  );
  if (!packageMatch) {
    throw new Error("Could not read unimozer-next version from src-tauri/Cargo.lock");
  }
  return packageMatch[1];
};

const packageJson = readJson("package.json");
const packageLockJson = readJson("package-lock.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");

const versions = [
  ["package.json", packageJson.version],
  ["package-lock.json", packageLockJson.version],
  ['package-lock.json packages[""]', packageLockJson.packages?.[""]?.version],
  ["src-tauri/Cargo.toml", readCargoPackageVersion()],
  ["src-tauri/Cargo.lock", readCargoLockPackageVersion()],
  ["src-tauri/tauri.conf.json", tauriConfig.version]
];

const missing = versions.filter(([, version]) => typeof version !== "string" || !version);
if (missing.length > 0) {
  console.error("Missing version values:");
  for (const [label] of missing) {
    console.error(`- ${label}`);
  }
  process.exit(1);
}

const expected = versions[0][1];
const mismatches = versions.filter(([, version]) => version !== expected);

if (mismatches.length > 0) {
  console.error(`Version mismatch detected. Expected ${expected} everywhere.`);
  for (const [label, version] of versions) {
    const marker = version === expected ? " " : "*";
    console.error(`${marker} ${label}: ${version}`);
  }
  process.exit(1);
}

console.log(`Version consistency check passed: ${expected}`);
