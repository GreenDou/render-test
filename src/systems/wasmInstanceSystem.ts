import { INSTANCE_BOUNDS, INSTANCE_STRIDE, RENDER_INSTANCE_STRIDE } from '../contracts/renderSpec';
import type { InstanceSystem } from '../contracts/types';
import instanceUpdateWasmUrl from '../wasm/instance-update.wasm?url';
import { createInstanceState, packRenderData } from './jsInstanceSystem';

interface InstanceUpdateWasmExports {
  memory: WebAssembly.Memory;
  update(ptr: number, count: number, dt: number, time: number, bounds: number): void;
}

type InstanceUpdateWasmInstance = WebAssembly.Instance & {
  exports: WebAssembly.Exports & InstanceUpdateWasmExports;
};

interface FreeBlock {
  ptr: number;
  byteLength: number;
}

interface WasmRuntime {
  instance: InstanceUpdateWasmInstance;
  freeBlocks: FreeBlock[];
  nextPtr: number;
}

const WASM_PAGE_BYTES = 64 * 1024;
const STATE_BYTES_PER_INSTANCE = INSTANCE_STRIDE * Float32Array.BYTES_PER_ELEMENT;
let instanceUpdateModulePromise: Promise<WebAssembly.Module> | null = null;
let wasmRuntimePromise: Promise<WasmRuntime> | null = null;

async function getInstanceUpdateModule(): Promise<WebAssembly.Module> {
  if (!instanceUpdateModulePromise) {
    instanceUpdateModulePromise = (async () => {
      const response = await fetch(instanceUpdateWasmUrl);
      const bytes = await response.arrayBuffer();
      return WebAssembly.compile(bytes);
    })();
  }

  return instanceUpdateModulePromise;
}

async function getWasmRuntime(): Promise<WasmRuntime> {
  if (!wasmRuntimePromise) {
    wasmRuntimePromise = (async () => {
      const module = await getInstanceUpdateModule();
      const instance = await WebAssembly.instantiate(module, {});
      return {
        instance: instance as unknown as InstanceUpdateWasmInstance,
        freeBlocks: [],
        nextPtr: 0,
      };
    })();
  }

  return wasmRuntimePromise;
}

function alignTo(value: number, alignment: number): number {
  const remainder = value % alignment;
  return remainder === 0 ? value : value + alignment - remainder;
}

function ensureMemoryCapacity(runtime: WasmRuntime, requiredBytes: number): void {
  const memory = runtime.instance.exports.memory;
  const currentBytes = memory.buffer.byteLength;
  if (requiredBytes <= currentBytes) {
    return;
  }

  const missingBytes = requiredBytes - currentBytes;
  const additionalPages = Math.ceil(missingBytes / WASM_PAGE_BYTES);
  memory.grow(additionalPages);
}

function coalesceFreeBlocks(runtime: WasmRuntime): void {
  if (runtime.freeBlocks.length <= 1) {
    return;
  }

  runtime.freeBlocks.sort((left, right) => left.ptr - right.ptr);
  const merged: FreeBlock[] = [];
  for (const block of runtime.freeBlocks) {
    const last = merged[merged.length - 1];
    if (last && last.ptr + last.byteLength === block.ptr) {
      last.byteLength += block.byteLength;
      continue;
    }
    merged.push({ ...block });
  }
  runtime.freeBlocks = merged;
}

function allocateState(runtime: WasmRuntime, byteLength: number): number {
  const alignedByteLength = alignTo(byteLength, STATE_BYTES_PER_INSTANCE);

  for (let index = 0; index < runtime.freeBlocks.length; index += 1) {
    const block = runtime.freeBlocks[index];
    if (block.byteLength < alignedByteLength) {
      continue;
    }

    const ptr = block.ptr;
    if (block.byteLength === alignedByteLength) {
      runtime.freeBlocks.splice(index, 1);
    } else {
      block.ptr += alignedByteLength;
      block.byteLength -= alignedByteLength;
    }
    return ptr;
  }

  const ptr = alignTo(runtime.nextPtr, STATE_BYTES_PER_INSTANCE);
  const requiredBytes = ptr + alignedByteLength;
  ensureMemoryCapacity(runtime, requiredBytes);
  runtime.nextPtr = requiredBytes;
  return ptr;
}

function releaseState(runtime: WasmRuntime, ptr: number, byteLength: number): void {
  runtime.freeBlocks.push({
    ptr,
    byteLength: alignTo(byteLength, STATE_BYTES_PER_INSTANCE),
  });
  coalesceFreeBlocks(runtime);
}

export class WasmInstanceSystem implements InstanceSystem {
  static async create(count: number, scaleBase: number): Promise<WasmInstanceSystem> {
    const runtime = await getWasmRuntime();
    return new WasmInstanceSystem(runtime, count, scaleBase);
  }

  private readonly ptr: number;
  private readonly byteLength: number;
  private stateView: Float32Array | null = null;
  private readonly renderData: Float32Array;
  private destroyed = false;

  private constructor(
    private readonly runtime: WasmRuntime,
    private readonly count: number,
    scaleBase: number,
  ) {
    const initialState = createInstanceState(count, scaleBase);
    this.byteLength = initialState.byteLength;
    this.ptr = allocateState(runtime, this.byteLength);
    this.getStateView().set(initialState);
    this.renderData = new Float32Array(count * RENDER_INSTANCE_STRIDE);
  }

  update(dt: number, time: number): void {
    this.runtime.instance.exports.update(this.ptr, this.count, dt, time, INSTANCE_BOUNDS);
  }

  getRenderData(): Float32Array {
    return packRenderData(this.getStateView(), this.count, this.renderData);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    releaseState(this.runtime, this.ptr, this.byteLength);
    this.stateView = null;
    this.destroyed = true;
  }

  private getStateView(): Float32Array {
    const currentBuffer = this.runtime.instance.exports.memory.buffer;
    if (!this.stateView || this.stateView.buffer !== currentBuffer) {
      this.stateView = new Float32Array(currentBuffer, this.ptr, this.count * INSTANCE_STRIDE);
    }

    return this.stateView;
  }
}
