import { NarrationRelayServer } from "./relay-server.js";

const DEFAULT_PORT = 3010;

function parseArg(args: string[], prefix: string): string | undefined {
  const arg = args.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

async function main(): Promise<void> {
  const portArg = parseArg(process.argv.slice(2), "--port=");
  const port = portArg
    ? parseInt(portArg, 10)
    : parseInt(process.env.NARRATION_PORT ?? "", 10) || DEFAULT_PORT;

  const relay = new NarrationRelayServer(port);
  await relay.start();

  const shutdown = async () => {
    console.info("Shutting down narration relay...");
    await relay.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}

main().catch((error) => {
  console.error("Narration relay fatal error:", error);
  process.exit(1);
});
