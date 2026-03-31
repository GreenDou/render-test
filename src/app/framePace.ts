const TARGET_FRAME_MS = 1000 / 60;
const LONG_FRAME_MS = 1000 / 30;
const MAX_VISIBLE_FRAME_MS = 120;
const HISTORY_LIMIT = 240;

export interface FramePaceSummary {
  averageFps: number;
  latestFrameMs: number;
  p95FrameMs: number;
  longFrameCount: number;
  sampleCount: number;
}

function percentile(sortedValues: readonly number[], ratio: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((sortedValues.length - 1) * ratio)));
  return sortedValues[index];
}

export function pushFramePaceSample(history: number[], frameMs: number): number[] {
  history.push(frameMs);
  if (history.length > HISTORY_LIMIT) {
    history.splice(0, history.length - HISTORY_LIMIT);
  }

  return history;
}

export function summarizeFramePace(samples: readonly number[]): FramePaceSummary {
  if (samples.length === 0) {
    return {
      averageFps: 0,
      latestFrameMs: 0,
      p95FrameMs: 0,
      longFrameCount: 0,
      sampleCount: 0,
    };
  }

  const totalFrameMs = samples.reduce((sum, value) => sum + value, 0);
  const sorted = [...samples].sort((left, right) => left - right);

  return {
    averageFps: samples.length * 1000 / totalFrameMs,
    latestFrameMs: samples[samples.length - 1],
    p95FrameMs: percentile(sorted, 0.95),
    longFrameCount: samples.filter((value) => value > LONG_FRAME_MS).length,
    sampleCount: samples.length,
  };
}

export function drawFramePaceChart(canvas: HTMLCanvasElement, samples: readonly number[]): void {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const cssWidth = Math.max(96, Math.round(canvas.clientWidth || 0));
  const cssHeight = Math.max(32, Math.round(canvas.clientHeight || 0));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
  const backingHeight = Math.max(1, Math.round(cssHeight * dpr));

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);

  const maxFrameMs = Math.min(
    MAX_VISIBLE_FRAME_MS,
    Math.max(LONG_FRAME_MS * 1.6, ...samples.map((value) => Math.min(value, MAX_VISIBLE_FRAME_MS))),
  );

  const drawThresholdLine = (frameMs: number, strokeStyle: string): void => {
    const y = cssHeight - Math.min(frameMs, maxFrameMs) / maxFrameMs * cssHeight;
    context.strokeStyle = strokeStyle;
    context.lineWidth = 1;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(cssWidth, y);
    context.stroke();
    context.setLineDash([]);
  };

  drawThresholdLine(TARGET_FRAME_MS, 'rgba(125, 226, 255, 0.22)');
  drawThresholdLine(LONG_FRAME_MS, 'rgba(255, 181, 87, 0.3)');

  if (samples.length === 0) {
    context.fillStyle = 'rgba(151, 167, 199, 0.9)';
    return;
  }

  const visibleSamples = samples.slice(-HISTORY_LIMIT);
  const barWidth = cssWidth / visibleSamples.length;

  for (let index = 0; index < visibleSamples.length; index += 1) {
    const sample = Math.min(visibleSamples[index], MAX_VISIBLE_FRAME_MS);
    const height = Math.max(1.5, sample / maxFrameMs * cssHeight);
    const x = index * barWidth;
    const y = cssHeight - height;

    if (sample > LONG_FRAME_MS) {
      context.fillStyle = 'rgba(255, 123, 114, 0.95)';
    } else if (sample > TARGET_FRAME_MS) {
      context.fillStyle = 'rgba(255, 209, 102, 0.88)';
    } else {
      context.fillStyle = 'rgba(125, 226, 255, 0.78)';
    }

    context.fillRect(x, y, Math.max(1, barWidth - 1), height);
  }
}
