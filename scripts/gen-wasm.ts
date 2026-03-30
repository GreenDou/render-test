import * as fs from 'node:fs/promises';
import * as path from 'node:path';

type WabtFactory = () => Promise<{
  parseWat(filename: string, source: string): {
    toBinary(options: { log: boolean; write_debug_names: boolean }): { buffer: Uint8Array };
    destroy?: () => void;
  };
}>;

type WabtModule = WabtFactory | { default: WabtFactory };

async function loadWabtFactory(): Promise<WabtFactory> {
  const wabtModule = (await import('wabt')) as unknown as WabtModule;
  return typeof wabtModule === 'function' ? wabtModule : wabtModule.default;
}

async function main(): Promise<void> {
  const watPath = path.resolve(process.cwd(), 'src/wasm/instance-update.wat');
  const wasmPath = path.resolve(process.cwd(), 'src/wasm/instance-update.wasm');
  const watSource = await fs.readFile(watPath, 'utf8');
  const wabtFactory = await loadWabtFactory();
  const wabt = await wabtFactory();
  const parsed = wabt.parseWat(watPath, watSource);
  const { buffer } = parsed.toBinary({
    log: false,
    write_debug_names: true,
  });

  await fs.writeFile(wasmPath, Buffer.from(buffer));
  parsed.destroy?.();

  console.log(`Generated ${wasmPath}`);
}

void main();
