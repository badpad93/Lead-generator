import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (existsSync(".git") && process.env.HUSKY !== "0") {
  const result = spawnSync("husky", {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error("Failed to install Git hooks:", result.error.message);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}
