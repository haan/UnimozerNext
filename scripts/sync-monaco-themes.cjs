const fs = require("fs");
const path = require("path");

const root = process.cwd();
const srcDir = path.join(root, "node_modules", "monaco-themes", "themes");
const destDir = path.join(root, "public", "themes");

if (!fs.existsSync(srcDir)) {
  console.error("monaco-themes not found. Run npm install monaco-themes first.");
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

const files = fs
  .readdirSync(srcDir)
  .filter((file) => file.toLowerCase().endsWith(".json"));

files.forEach((file) => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  fs.copyFileSync(srcPath, destPath);
});

console.log(`Copied ${files.length} themes to public/themes.`);
