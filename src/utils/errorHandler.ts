

export interface ErrorDetails {
  message: string;
  code?: string | number;
  stack?: string;
  cause?: unknown;
  context?: Record<string, unknown>;
}


export function formatError(error: unknown): ErrorDetails {
  if (!error) {
    return { message: "Không xác định" };
  }

  
  if (error instanceof Error) {
    return {
      message: error.message || error.toString(),
      code: (error as Error & { code?: string | number }).code,
      stack: error.stack,
      cause: (error as Error & { cause?: unknown }).cause,
    };
  }

  
  if (typeof error === "string") {
    return { message: error };
  }

  
  const axiosError = error as { response?: { data?: unknown }; code?: string | number };
  if (axiosError?.response?.data) {
    const data = axiosError.response.data;
    if (typeof data === "string") {
      return { message: data, code: axiosError.code };
    }
    try {
      return {
        message: JSON.stringify(data),
        code: axiosError.code,
      };
    } catch {
      return { message: String(data), code: axiosError.code };
    }
  }

  
  const objError = error as { error?: unknown; message?: unknown; code?: string | number };
  const target = objError.error ?? objError.message ?? error;

  if (!target) {
    return { message: "Không xác định" };
  }

  if (typeof target === "string") {
    return { message: target, code: objError.code };
  }

  if (target instanceof Error) {
    return {
      message: target.message || target.toString(),
      code: objError.code,
      stack: target.stack,
    };
  }

  
  try {
    return { message: JSON.stringify(target), code: objError.code };
  } catch {
    return { message: String(target), code: objError.code };
  }
}


export function getErrorMessage(error: unknown): string {
  return formatError(error).message;
}


export function isNetworkError(error: unknown): boolean {
  const details = formatError(error);
  const code = String(details.code || "").toLowerCase();
  const message = details.message.toLowerCase();

  return (
    code === "econnreset" ||
    code === "econnrefused" ||
    code === "etimedout" ||
    message.includes("econnreset") ||
    message.includes("connection reset") ||
    message.includes("socket hang up") ||
    message.includes("connection lost") ||
    message.includes("timeout") ||
    message.includes("network")
  );
}


export function isTimeoutError(error: unknown): boolean {
  const details = formatError(error);
  const code = String(details.code || "").toUpperCase();
  const message = details.message.toLowerCase();

  return (
    code === "ETIMEDOUT" ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
}


export function isLoggedOutError(error: unknown): boolean {
  const details = formatError(error);
  const message = details.message.toLowerCase();

  return (
    message.includes("logged out") ||
    message.includes("không còn đăng nhập") ||
    message.includes("account logged out")
  );
}


export function createErrorHandler(logger?: {
  error?: (message: string) => void;
  warn?: (message: string) => void;
}) {
  return (error: unknown, context?: string) => {
    const details = formatError(error);
    const prefix = context ? `[${context}]` : "";
    const message = `${prefix} ${details.message}`;

    if (logger?.error) {
      logger.error(message);
      if (process.env.DEV_MODE && details.stack) {
        logger.error(details.stack);
      }
    } else {
      console.error(message);
      if (process.env.DEV_MODE && details.stack) {
        console.error(details.stack);
      }
    }
  };
}
