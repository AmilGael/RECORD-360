"use client";
import { ErrorScreen } from "@/components/error-screen";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} scope="app" />;
}
