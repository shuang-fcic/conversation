// stdout is reserved for pipeable command output; diagnostics use stderr.
export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}
