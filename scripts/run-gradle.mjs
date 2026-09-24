import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const [bridge, ...args] = process.argv.slice(2);
if (!["java-parser", "jshell-bridge"].includes(bridge) || args.length === 0) {
  console.error("Usage: node scripts/run-gradle.mjs <java-parser|jshell-bridge> <task> [options]");
  process.exit(1);
}

const projectDir = path.resolve(import.meta.dirname, "..", bridge);
const java = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
  : "java";

// Invoke the same official Wrapper entry point as gradlew/gradlew.bat, without
// routing npm arguments through a platform-specific shell.
const result = spawnSync(java, [
  "-Xmx64m",
  "-Xms64m",
  "-Dorg.gradle.appname=gradlew",
  "-jar",
  path.join(projectDir, "gradle", "wrapper", "gradle-wrapper.jar"),
  ...args
], { cwd: projectDir, stdio: "inherit" });

if (result.error) {
  console.error(`Could not start the Gradle Wrapper: ${result.error.message}. Set JAVA_HOME to a JDK 25 installation or put Java 25 on PATH.`);
}
process.exit(result.status ?? 1);
