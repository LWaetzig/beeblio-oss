"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronRight, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import {
  SETTING_GROUPS,
  SETTINGS,
  type SettingDefinition,
  type SettingName,
  type SettingsSnapshot,
  type SettingStatus,
} from "@/lib/app-settings-registry";
import { getSettings, saveSettings } from "../settings-actions";

/** Pages where people get the values the dialog asks for. */
const HELP_LINKS: Partial<Record<SettingName, { href: string; label: string }>> = {
  OPENROUTER_API_KEY: { href: "https://openrouter.ai/keys", label: "Get a key" },
  OPENROUTER_MODEL_ID: { href: "https://openrouter.ai/models", label: "Browse models" },
  GOOGLE_API_KEY: { href: "https://aistudio.google.com/apikey", label: "Get a key" },
};

type FieldError = { message: string; field?: SettingName };

function describeSecret(status: SettingStatus | undefined) {
  if (status?.source === "settings") return `Saved here · ends in ${status.last4}`;
  if (status?.source === "env") return `From .env.local · ends in ${status.last4}`;
  return "Not set";
}

/** Plain values start as the current value, so an untouched field is never sent back. */
function initialDrafts(snapshot: SettingsSnapshot): Partial<Record<SettingName, string>> {
  return Object.fromEntries(SETTINGS.filter((setting) => setting.kind !== "secret").map((setting) => [setting.name, snapshot.settings[setting.name]?.value ?? ""]));
}

/**
 * App-wide settings, as opposed to the per-project ProjectSettingsDialog. It
 * renders every setting in lib/app-settings-registry.ts. Values are validated
 * and stored on the server; the browser only learns the last four characters
 * of a secret.
 */
export function AppSettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lets the caller refresh anything that depends on setup being complete. */
  onSaved?: (snapshot: SettingsSnapshot) => void;
}) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot>();
  const [drafts, setDrafts] = useState<Partial<Record<SettingName, string>>>({});
  const [pending, setPending] = useState<"save" | SettingName>();
  const [error, setError] = useState<FieldError>();

  useEffect(() => {
    if (!open) return;
    setSnapshot(undefined);
    setError(undefined);
    let cancelled = false;
    void getSettings()
      .then((current) => {
        if (cancelled) return;
        setSnapshot(current);
        setDrafts(initialDrafts(current));
      })
      .catch(() => { if (!cancelled) setError({ message: "Settings could not be loaded. Close and reopen this dialog to try again." }); });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const changes = useMemo(() => {
    if (!snapshot) return {};
    const patch: Partial<Record<SettingName, string | null>> = {};
    for (const setting of SETTINGS) {
      const draft = drafts[setting.name]?.trim() ?? "";
      if (setting.kind === "secret") {
        if (draft) patch[setting.name] = draft;
      } else if (draft !== (snapshot.settings[setting.name]?.value ?? "")) {
        patch[setting.name] = draft || null;
      }
    }
    return patch;
  }, [drafts, snapshot]);
  const hasChanges = Object.keys(changes).length > 0;

  const apply = async (patch: Partial<Record<SettingName, string | null>>, busy: "save" | SettingName, success: string) => {
    setPending(busy);
    setError(undefined);
    try {
      const result = await saveSettings(patch);
      if (!result.success) {
        setError({ message: result.error, field: result.field });
        return;
      }
      setSnapshot(result.snapshot);
      setDrafts(initialDrafts(result.snapshot));
      onSaved?.(result.snapshot);
      toast.success(success);
      for (const warning of result.warnings) toast.warning(warning);
    } catch {
      setError({ message: "Settings could not be saved. Try again." });
    } finally {
      setPending(undefined);
    }
  };

  const busy = pending !== undefined;
  const fieldProps = { snapshot, drafts, error, busy, pending, setDraft: (name: SettingName, value: string) => { setDrafts((current) => ({ ...current, [name]: value })); setError(undefined); }, remove: (setting: SettingDefinition) => void apply({ [setting.name]: null }, setting.name as SettingName, `${setting.label} key removed`) };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="text-xs">
            These settings apply to every project on this computer and take effect right away.
          </DialogDescription>
        </DialogHeader>
        {snapshot?.missingRequired.length ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" role="status">
            To start chatting, add: {snapshot.missingRequired.join(", ")}.
          </p>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (hasChanges) void apply(changes, "save", "Settings saved");
          }}
          className="flex flex-col gap-5"
          aria-busy={!snapshot}
          // The server validates every field and reports problems inline; the
          // browser's own email check would block that with a different message.
          noValidate
        >
          {!snapshot && !error ? <p className="text-xs text-muted-foreground">Loading…</p> : null}
          {snapshot ? SETTING_GROUPS.map((group) => {
            const settings = SETTINGS.filter((setting) => setting.group === group.id);
            const fields = settings.map((setting) => <SettingField key={setting.name} setting={setting} {...fieldProps} />);
            const heading = (
              <div className="min-w-0 text-left">
                <p className="text-xs font-medium">{group.label}</p>
                <p className="text-[11px] text-muted-foreground">{group.description}</p>
              </div>
            );
            if (!group.optional) {
              return (
                <section key={group.id} className="flex flex-col gap-3" aria-label={group.label}>
                  {heading}
                  <div className="flex flex-col gap-3 rounded-lg border p-3">{fields}</div>
                </section>
              );
            }
            // Optional groups start open only when something in them is already set.
            const inUse = settings.some((setting) => snapshot.settings[setting.name]?.source);
            return (
              <Collapsible key={group.id} defaultOpen={inUse} className="group/section flex flex-col gap-3">
                <CollapsibleTrigger className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20">
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/section:rotate-90" aria-hidden="true" />
                  {heading}
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-3 rounded-lg border p-3">{fields}</CollapsibleContent>
              </Collapsible>
            );
          }) : null}

          {/* Repeated here because the field it belongs to may be in a collapsed section. */}
          {error ? <p className="text-xs text-destructive" role="alert">{error.message}</p> : null}
          <DialogFooter className="sticky bottom-0 -mx-1 bg-background/95 px-1 pt-2 backdrop-blur">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Done
            </Button>
            <Button type="submit" disabled={busy || !hasChanges}>
              {pending === "save" ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingField({
  setting,
  snapshot,
  drafts,
  error,
  busy,
  pending,
  setDraft,
  remove,
}: {
  setting: SettingDefinition;
  snapshot: SettingsSnapshot | undefined;
  drafts: Partial<Record<SettingName, string>>;
  error: FieldError | undefined;
  busy: boolean;
  pending: "save" | SettingName | undefined;
  setDraft: (name: SettingName, value: string) => void;
  remove: (setting: SettingDefinition) => void;
}) {
  const name = setting.name as SettingName;
  const status = snapshot?.settings[name];
  const id = `setting-${name}`;
  const secret = setting.kind === "secret";
  const draft = drafts[name] ?? "";
  const missing = setting.required && !status?.source && !draft.trim();
  const fieldError = error?.field === name ? error.message : undefined;
  const link = HELP_LINKS[name];
  // Says where a prefilled value comes from until the person edits it.
  const fromEnvironment = !secret && status?.source === "env" && draft === (status.value ?? "");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={id} className="text-xs font-medium">
            {setting.label}
            {missing ? <span className="ml-1.5 text-[11px] font-normal text-amber-700 dark:text-amber-400">Required</span> : null}
          </Label>
          <p className="text-[11px] text-muted-foreground">
            {secret ? <span aria-live="polite">{describeSecret(status)} · </span> : null}
            {fromEnvironment ? "From .env.local · " : null}
            {setting.help}
            {link ? (
              <>
                {" "}
                <a href={link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
                  {link.label}<ArrowUpRight className="size-3" aria-hidden="true" />
                </a>
              </>
            ) : null}
          </p>
        </div>
        {secret && status?.source === "settings" ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => remove(setting)} disabled={busy} aria-label={`Remove the saved ${setting.label} key`}>
            {pending === name ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Remove
          </Button>
        ) : null}
      </div>
      <Input
        id={id}
        type={secret ? "password" : setting.kind === "email" ? "email" : "text"}
        inputMode={setting.kind === "integer" ? "numeric" : undefined}
        className="h-9 text-xs md:text-xs"
        value={draft}
        placeholder={secret && status?.source ? "Enter a new key to replace it" : setting.placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? `${id}-error` : undefined}
        onChange={(event) => setDraft(name, event.target.value)}
      />
      {fieldError ? <p id={`${id}-error`} className="text-xs text-destructive">{fieldError}</p> : null}
    </div>
  );
}
