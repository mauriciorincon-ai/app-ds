"use client";

import { useT } from "@/i18n/use-translation";
import type { WorkerErrorKind } from "@/workers/protocol";
import { Button } from "./ui";

export function ErrorScreen({
  kind,
  onRetry,
}: {
  kind: WorkerErrorKind;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-start gap-4" role="alert">
      <span aria-hidden className="text-2xl text-negative">
        ⚠
      </span>
      <h1 className="text-2xl font-semibold">{t("errors.title")}</h1>
      <p className="text-ink-muted">{t(`errors.${kind}`)}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t("errors.retry")}
      </Button>
    </div>
  );
}
