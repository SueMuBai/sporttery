import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const failures = [];

for (const relative of [
  "web",
  "android/app/src/main/python",
  "scripts/prepare_android.py",
  "sporttery_web.py",
  "sporttery_history.py",
  "sporttery_db.py",
]) {
  if (existsSync(join(root, relative)))
    failures.push(`旧运行时路径仍存在：${relative}`);
}

const capacitor = JSON.parse(
  readFileSync(join(root, "capacitor.config.json"), "utf8"),
);
if (capacitor.webDir !== "dist") failures.push("Capacitor webDir 必须为 dist");
if ("server" in capacitor)
  failures.push("Capacitor 生产配置不能包含 server.url");

const filesToInspect = [
  "android/build.gradle",
  "android/app/build.gradle",
  "android/app/src/main/java/com/suemubai/sporttery/MainActivity.java",
  "android/app/src/main/AndroidManifest.xml",
  "package.json",
];
const forbidden = [
  "com.chaquo",
  "chaquopy",
  "mobile_server",
  "127.0.0.1:8765",
  "ThreadingHTTPServer",
];
for (const relative of filesToInspect) {
  const content = readFileSync(join(root, relative), "utf8");
  for (const token of forbidden) {
    if (content.toLowerCase().includes(token.toLowerCase())) {
      failures.push(`${relative} 仍包含 ${token}`);
    }
  }
}

const publicDir = join(root, "android/app/src/main/assets/public");
const indexPath = join(publicDir, "index.html");
if (!existsSync(indexPath))
  failures.push("Capacitor Android 资源缺少 index.html");
else if (!readFileSync(indexPath, "utf8").includes('type="module"')) {
  failures.push("Android index.html 不是 Vite 模块入口");
}

const pluginPath = join(
  root,
  "android/app/src/main/assets/capacitor.plugins.json",
);
if (!existsSync(pluginPath))
  failures.push("Capacitor 插件清单不存在，请先运行 android:sync");
else {
  const plugins = readFileSync(pluginPath, "utf8");
  for (const plugin of [
    "AppPlugin",
    "CapacitorSQLite",
    "Filesystem",
    "Share",
  ]) {
    if (!plugins.includes(plugin))
      failures.push(`Android 插件清单缺少 ${plugin}`);
  }
}

const navigationDir = join(root, "src/assets/icons/navigation");
if (
  !existsSync(navigationDir) ||
  readdirSync(navigationDir).filter((name) => name.endsWith(".svg")).length !==
    6
) {
  failures.push("项目内必须保留 6 个底部导航 SVG 资源");
}

if (failures.length) {
  process.stderr.write(`${failures.map((item) => `- ${item}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(
  "Legacy runtime verification passed: pure Vite + Capacitor Android runtime is ready.\n",
);
