import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const resourcesDir = path.join(root, "resources", "jdk");
const currentDir = path.join(resourcesDir, "current");

const map = {
  win32: {
    x64: "win-x64",
    arm64: "win-arm64"
  },
  darwin: {
    x64: "mac-x64",
    arm64: "mac-arm64"
  },
  linux: {
    x64: "linux-x64",
    arm64: "linux-arm64"
  }
};

const override = process.env.JDK_TARGET;
const platform = process.platform;
const arch = process.arch;
const target = override || map[platform]?.[arch];

if (!target) {
  console.error(
    `Unsupported platform/arch: ${platform}/${arch}. Set JDK_TARGET explicitly (e.g. win-x64).`
  );
  process.exit(1);
}

const sourceDir = path.join(resourcesDir, target);
if (!fs.existsSync(sourceDir)) {
  console.error(`Missing JDK folder: ${sourceDir}`);
  console.error("Place the Temurin JDK under resources/jdk/<platform-arch>.");
  process.exit(1);
}

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const copyDir = (src, dest) => {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyDir(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.copyFileSync(src, dest);
};

if (fs.existsSync(currentDir)) {
  fs.rmSync(currentDir, { recursive: true, force: true });
}

ensureDir(currentDir);
copyDir(sourceDir, currentDir);

console.log(`JDK selected: ${target}`);
console.log(`Copied to: ${currentDir}`);
