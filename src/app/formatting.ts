export function safeStringify(value: unknown): string {
  try {
    if (value instanceof Error) {
      return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
    }

    if (typeof value === 'string') {
      return value;
    }

    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatError(error: unknown, context = ''): string {
  if (!error) {
    return context || '未知错误';
  }

  const prefix = context ? `[${context}] ` : '';
  if (error instanceof Error) {
    return `${prefix}${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`;
  }

  return `${prefix}${safeStringify(error)}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}

export function formatDurationMs(value: number): string {
  if (value < 0.1) {
    return `${(value * 1000).toFixed(0)}μs`;
  }

  return `${value.toFixed(2)}ms`;
}

export function formatUploadBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0B';
  }
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

export function formatFpsWithJitter(fps: number): string {
  return fps.toFixed(1);
}
