"use client";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { ApiError, command, type Command } from "@didban/api-client";
// Preserve the same key and payload after an uncertain network failure; never silently retry a mutation.
export function useCommand<I, O>(
  run: (input: I, cmd: Command) => Promise<O>,
  onSuccess?: (output: O) => Promise<unknown> | void,
) {
  const last = useRef<{ payload: string; cmd: Command } | null>(null);
  return useMutation({
    mutationFn: async (input: I) => {
      const payload = JSON.stringify(input);
      if (!last.current || last.current.payload !== payload)
        last.current = { payload, cmd: command() };
      try {
        const result = await run(input, last.current.cmd);
        last.current = null;
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.status < 500)
          last.current = null;
        throw error;
      }
    },
    onSuccess,
  });
}
