import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const failures = [];

function directoryManifest(directory, base = directory) {
  if (!existsSync(directory)) return new Map();
  const manifest = new Map();
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    if (statSync(absolute).isDirectory()) {
      for (const [relative, digest] of directoryManifest(absolute, base)) {
        manifest.set(relative, digest);
      }
      continue;
    }
    const relative = absolute.slice(base.length + 1).replaceAll("\\", "/");
    const digest = createHash("sha256")
      .update(readFileSync(absolute))
      .digest("hex");
    manifest.set(relative, digest);
  }
  return manifest;
}

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

const webIndex = readFileSync(join(root, "index.html"), "utf8");
if (!webIndex.includes("interactive-widget=resizes-content")) {
  failures.push("Web viewport 必须声明 interactive-widget=resizes-content");
}

const nativeAdapterRelative =
  "src/services/database/native/CapacitorSqliteAdapter.ts";
const nativeAdapter = readFileSync(join(root, nativeAdapterRelative), "utf8");
for (const required of [
  "const nativeDatabaseQueue = new SerialTaskQueue()",
  "private readonly transactions = nativeDatabaseQueue",
  "this.db.run(statement, values, false, returnMode)",
]) {
  if (!nativeAdapter.includes(required)) {
    failures.push(`原生数据库适配器缺少事务保护：${required}`);
  }
}
if ((nativeAdapter.match(/this\.db\.run\(/g) ?? []).length !== 1) {
  failures.push("原生数据库写入必须只通过 runInTransaction 的单一 db.run 出口");
}
if (
  (nativeAdapter.match(/this\.db\.execute\(/g) ?? []).length !== 1 ||
  !nativeAdapter.includes("this.db.execute(NATIVE_SCHEMA, false)")
) {
  failures.push("原生数据库 execute 只能用于无隐式事务的 Schema 初始化");
}

const sourceManifest = directoryManifest(join(root, "src"));
for (const relative of sourceManifest.keys()) {
  if (!/\.(?:ts|vue)$/.test(relative)) continue;
  const sourceRelative = `src/${relative}`;
  if (sourceRelative === nativeAdapterRelative) continue;
  const content = readFileSync(join(root, sourceRelative), "utf8");
  for (const forbiddenCall of [
    "new SQLiteConnection(",
    ".beginTransaction(",
    ".commitTransaction(",
    ".rollbackTransaction(",
  ]) {
    if (content.includes(forbiddenCall)) {
      failures.push(
        `${sourceRelative} 不得绕过原生数据库适配器调用 ${forbiddenCall}`,
      );
    }
  }
}

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

const androidManifest = readFileSync(
  join(root, "android/app/src/main/AndroidManifest.xml"),
  "utf8",
);
if (!androidManifest.includes('android:windowSoftInputMode="adjustResize"')) {
  failures.push("Android Activity 必须使用 adjustResize 适配输入法");
}

const androidWorkflow = readFileSync(
  join(root, ".github/workflows/android-build.yml"),
  "utf8",
);
const syncPosition = androidWorkflow.indexOf("npm run android:sync");
const runtimePosition = androidWorkflow.indexOf("npm run verify:runtime");
if (syncPosition < 0 || runtimePosition < syncPosition) {
  failures.push("Android 工作流必须先同步 Capacitor，再验证最终运行资源");
}
for (const required of [
  "./gradlew assembleRelease",
  '$APKSIGNER" verify --verbose --print-certs',
  'unzip -Z1 "$APK"',
  "web_entry_sha256=",
  "app-release.apk.sha256",
  "build-info.txt",
]) {
  if (!androidWorkflow.includes(required)) {
    failures.push(`Android 工作流缺少发布校验：${required}`);
  }
}

const publicDir = join(root, "android/app/src/main/assets/public");
const indexPath = join(publicDir, "index.html");
if (!existsSync(indexPath))
  failures.push("Capacitor Android 资源缺少 index.html");
else if (!readFileSync(indexPath, "utf8").includes('type="module"')) {
  failures.push("Android index.html 不是 Vite 模块入口");
}

const distDir = join(root, "dist");
if (!existsSync(distDir)) {
  failures.push("缺少 dist，请先构建 Web 应用再同步 Android");
} else if (existsSync(publicDir)) {
  const distManifest = directoryManifest(distDir);
  const androidManifest = directoryManifest(publicDir);
  // Capacitor adds cordova.js and cordova_plugins.js during copy; those files
  // are expected Android-only extras. Every built dist file must nevertheless
  // exist byte-for-byte in the embedded application assets.
  const staleFiles = [...distManifest.keys()].filter(
    (relative) => distManifest.get(relative) !== androidManifest.get(relative),
  );
  if (staleFiles.length) {
    failures.push(
      `Android 内嵌 Web 资源与 dist 不一致（${staleFiles.slice(0, 5).join("、")}），请运行 npm run android:sync`,
    );
  }
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
