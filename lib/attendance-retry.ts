const transientCodes = new Set(["53200", "53300", "40001", "40P01", "55P03"]);

// Only wrap idempotent scans. The same request UUID and parameters survive every retry.
export async function withAttendanceRetry<T>(operation: () => Promise<T>, onRetry?: () => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (!transientCodes.has(code) || attempt >= 3) throw error;
      onRetry?.();
      await new Promise(resolve => setTimeout(resolve, [150, 400, 900][attempt] + Math.floor(Math.random() * 100)));
    }
  }
}
