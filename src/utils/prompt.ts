import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function promptEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  await rl.question(`${message} (press Enter to continue) `);
  rl.close();
}

/** Same as promptEnter, but typing "skip" (case-insensitive) returns true so the caller can bail. */
export async function promptEnterOrSkip(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${message} (press Enter to continue, or type "skip" to skip this) `);
  rl.close();
  return answer.trim().toLowerCase() === "skip";
}
