import { invokeSecureFunction } from "@/lib/secureInvoke";

export async function invokeAmlFunction<T = any>(functionName: string, payload: Record<string, any>): Promise<T> {
  const { data, error } = await invokeSecureFunction<T>(functionName, payload, { timeoutMs: 60000 });
  if (error) throw new Error(error.message ?? `${functionName} failed`);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}