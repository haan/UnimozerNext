import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkgPath = path.join(root, "package.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg?.version;
if (!version) {
  console.error("package.json version is missing.");
  process.exit(1);
}

const cargoPath = path.join(root, "src-tauri", "Cargo.toml");
const gradlePath = path.join(root, "java-parser", "build.gradle");

const updateFile = (filePath, replacer) => {
  const before = fs.readFileSync(filePath, "utf8");
  const after = replacer(before);
  if (before !== after) {
    fs.writeFileSync(filePath, after);
    console.log(`Updated ${path.relative(root, filePath)} to ${version}`);
  } else {
    console.log(`No change in ${path.relative(root, filePath)}`);
  }
};

updateFile(cargoPath, (text) =>
  text.replace(/^(version\s*=\s*")([^"]*)(")/m, `$1${version}$3`)
);

updateFile(gradlePath, (text) =>
  text.replace(/^(version\s*=\s*")([^"]*)(")/m, `$1${version}$3`)
);
