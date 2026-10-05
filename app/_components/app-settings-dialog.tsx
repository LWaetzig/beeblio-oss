"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiKeyStatus } from "@/lib/local-credentials";
import { getApiKeyStatus, removeOpenRouterKey, saveOpenRouterKey } from "../settings-actions";

function describeStatus(status: ApiKeyStatus | undefined) {
  if (!status) return "Checking…";
  if (status.source === "settings") return `Saved here · ends in ${status.last4}`;
  if (status.source === "env") return `From .env.local · ends in ${status.last4}`;
  return "Not set. The agent and AI writing tools need a key.";
}

/**
 * App-wide settings, as opposed to the per-project ProjectSettingsDialog.
 * Keys are checked and stored on the server; the browser only ever learns
 * where the current key comes from and its last four characters.
 */
export function AppSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [status, setStatus] = useState<ApiKeyStatus>();
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState<"save" | "remove">();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setApiKey("");
    setError(undefined);
    setStatus(undefined);
    let cancelled = false;
    void getApiKeyStatus()
      .then((current) => { if (!cancelled) setStatus(current); })
      .catch(() => { if (!cancelled) setError("The current key could not be loaded."); });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const save = async () => {
    setPending("save");
    setError(undefined);
    try {
      const result = await saveOpenRouterKey(apiKey);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setStatus(result.status);
      setApiKey("");
      toast.success("OpenRouter key saved");
    } catch {
      setError("The key could not be saved. Try again.");
    } finally {
      setPending(undefined);
    }
  };

  const remove = async () => {
    setPending("remove");
    setError(undefined);
    try {
      const result = await removeOpenRouterKey();
      if (!result.success) {
        setError(result.error);
        return;
      }
      setStatus(result.status);
      toast.success("Saved OpenRouter key removed");
    } catch {
      setError("The key could not be removed. Try again.");
    } finally {
      setPending(undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="text-xs">
            These settings apply to every project on this computer.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="flex flex-col gap-4"
        >
          <section className="flex flex-col gap-3" aria-label="API keys">
            <Label className="text-xs">API Keys</Label>
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor="openrouter-api-key" className="text-xs font-medium">OpenRouter</Label>
                  <p className="text-xs text-muted-foreground" aria-live="polite">{describeStatus(status)}</p>
                </div>
                {status?.source === "settings" ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void remove()} disabled={pending !== undefined}>
                    {pending === "remove" ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Input
                  id="openrouter-api-key"
                  type="password"
                  className="h-9 text-xs md:text-xs"
                  value={apiKey}
                  placeholder={status?.source ? "Enter a new key to replace it" : "sk-or-…"}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending !== undefined}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setError(undefined);
                  }}
                />
                <Button type="submit" disabled={pending !== undefined || !apiKey.trim()}>
                  {pending === "save" ? <Loader2 className="animate-spin" /> : <Save />}
                  Save
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                The key is checked with OpenRouter, then stored on this computer in <code>.beeblio/</code>. It takes
                effect right away and overrides <code>OPENROUTER_API_KEY</code> in <code>.env.local</code>.{" "}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
                >
                  Get a key<ArrowUpRight className="size-3" aria-hidden="true" />
                </a>
              </p>
            </div>
          </section>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending !== undefined}>
              Done
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
