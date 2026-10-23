import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{9,14}$/, "Enter a valid phone number (10-15 digits)");

export const requestOtpSchema = z.object({ phone: phoneSchema });

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export const createLoanSchema = z.object({
  friendName: z.string().trim().min(1, "Friend name is required").max(80),
  amount: z.coerce
    .number()
    .positive("Amount must be greater than 0")
    .max(10_000_000)
    .transform((n) => Math.round(n * 100) / 100),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD")
    .refine((s) => {
      const d = new Date(s + "T00:00:00Z");
      return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, "Due date is not a real calendar date"),
});