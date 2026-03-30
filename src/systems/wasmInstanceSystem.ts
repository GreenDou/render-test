import { INSTANCE_BOUNDS, RENDER_INSTANCE_STRIDE } from '../contracts/renderSpec';
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

export class WasmInstanceSystem implements InstanceSystem {
  static async create(count: number, scaleBase: number): Promise<WasmInstanceSystem> {
    const response = await fetch(instanceUpdateWasmUrl);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return new WasmInstanceSystem(instance as unknown as InstanceUpdateWasmInstance, count, scaleBase);
  }

  private readonly ptr = 0;
  private readonly state: Float32Array;
  private readonly renderData: Float32Array;

  private constructor(
    private readonly instance: InstanceUpdateWasmInstance,
    private readonly count: number,
    scaleBase: number,
  ) {
    const initialState = createInstanceState(count, scaleBase);
    this.state = new Float32Array(this.instance.exports.memory.buffer, this.ptr, initialState.length);
    this.state.set(initialState);
    this.renderData = new Float32Array(count * RENDER_INSTANCE_STRIDE);
  }

  update(dt: number, time: number): void {
    this.instance.exports.update(this.ptr, this.count, dt, time, INSTANCE_BOUNDS);
  }

  getRenderData(): Float32Array {
    return packRenderData(this.state, this.count, this.renderData);
  }
}
