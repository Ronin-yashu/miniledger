import { API_URL } from "./config";

export interface Loan {
  id: number;
  friendName: string;
  amount: number;
  dueDate: string;
  repaid: boolean;
  repaidAt: string | null;
  overdue: boolean;
  receiptUrl: string | null;
}

export interface Summary {
  totalLent: number;
  totalRepaid: number;
  totalOutstanding: number;
  overdueAmount: number;
}

export class UnauthorizedError extends Error {}

async function call<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      ...init,
      headers: {
        ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error(`Cannot reach server at ${API_URL}`);
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && token) throw new UnauthorizedError(body.error ?? "Session expired");
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  requestOtp: (phone: string) =>
    call<{ message: string }>("/auth/request-otp", null, { method: "POST", body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, otp: string) =>
    call<{ token: string }>("/auth/verify-otp", null, { method: "POST", body: JSON.stringify({ phone, otp }) }),
  loans: (token: string) => call<{ loans: Loan[] }>("/loans", token),
  summary: (token: string) => call<Summary>("/summary", token),
  repay: (token: string, id: number) => call<{ loan: Loan }>(`/loans/${id}/repay`, token, { method: "PATCH" }),
  addLoan: (
    token: string,
    data: { friendName: string; amount: string; dueDate: string; receipt?: { base64: string; mime: string } }
  ) =>
    call<{ loan: Loan }>("/loans", token, {
      method: "POST",
      body: JSON.stringify({
        friendName: data.friendName,
        amount: data.amount,
        dueDate: data.dueDate,
        ...(data.receipt ? { receiptBase64: data.receipt.base64, receiptMime: data.receipt.mime } : {}),
      }),
    }),
};

export const money = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });