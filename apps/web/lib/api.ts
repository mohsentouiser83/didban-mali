"use client";
import { ApiClient, ApiError } from "@didban/api-client";
export const api = new ApiClient((...args) => fetch(...args), () =>
  window.dispatchEvent(new Event("didban:session-expired")),
);
export const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "درخواست انجام نشد؛ دوباره تلاش کنید.";
export const isDenied = (error: unknown) =>
  error instanceof ApiError && [403, 404].includes(error.status);
