import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function promptEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  await rl.question(`${message} (press Enter to continue) `);
  rl.close();
}
