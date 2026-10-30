import { uiTextNodes } from "~/i18n/rich";
import { uiText } from "~/i18n";
import type { EnvironmentId } from "@t3tools/contracts";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import {
  readHostCredentialSettings,
  type SourceControlDefinition,
  type SourceControlHostCredentials,
} from "@t3tools/client-runtime/source-control-clients";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button, InlineButton } from "../ui/button";
import { Input } from "../ui/input";
import { SecretInput } from "./SecretInput";
import { Label } from "../ui/label";
export function SourceControlTokenSettings({
  environmentId,
  definition,
  credentials,
  onSaved,
}: {
  readonly environmentId: EnvironmentId;
  readonly definition: SourceControlDefinition;
  readonly credentials: SourceControlHostCredentials;
  readonly onSaved: () => void;
}) {
  const { tokens } = useEnvironmentSettings(environmentId, (settings) =>
    readHostCredentialSettings(settings, definition.kind),
  );
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: uiText("save {0} token", { 0: definition.label }),
  });
  const defaultHost = definition.publicHost ?? "";
  const [host, setHost] = useState(defaultHost);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const normalizedHost = host.trim().toLowerCase();
  const isSaved = (tokens[normalizedHost] ?? "").length > 0;
  const savedHosts = Object.entries(tokens)
    .filter(([, value]) => value.length > 0)
    .map(([saved]) => saved);
  const save = async (target: string, token: string) => {
    setSaving(true);
    const result = await updateSettings({
      environmentId,
      // Send the whole map; other tokens' redaction markers preserve their values.
      input: {
        patch: {
          sourceControlHosts: { [definition.kind]: { tokens: { ...tokens, [target]: token } } },
        },
      },
    });
    setSaving(false);
    if (result._tag === "Success") {
      setDraft("");
      onSaved();
    }
  };
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (normalizedHost && draft.trim()) void save(normalizedHost, draft.trim());
      }}
    >
      {/* Locked while saving: a successful save clears the draft, which would drop edits made mid-request. */}
      <fieldset disabled={saving} className="contents">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          {uiTextNodes(
            "A token saved here is used before {0} and the {1} login, so {2} works without the {3}. Give it {4}. {5}",
            {
              "0": (
                <code className="rounded bg-muted px-1 py-px text-2xs">
                  {credentials.tokenEnvVar}
                </code>
              ),
              "1": (
                <code className="rounded bg-muted px-1 py-px text-2xs">{credentials.cliName}</code>
              ),
              "2": definition.label,
              "3": credentials.cliLabel,
              "4": uiText(credentials.tokenAccess),
              "5":
                normalizedHost || defaultHost ? (
                  <InlineButton
                    render={
                      <a
                        href={credentials.newTokenUrl(normalizedHost || defaultHost)}
                        target="_blank"
                        rel="noreferrer noopener"
                      />
                    }
                  >
                    {uiText("Create a token")}
                    <ExternalLinkIcon aria-hidden className="size-3" />
                  </InlineButton>
                ) : null,
            },
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor={`${definition.kind}-token-host-${environmentId}`}>
              {uiText("Host")}
            </Label>
            <Input
              id={`${definition.kind}-token-host-${environmentId}`}
              autoComplete="off"
              size="sm"
              placeholder={defaultHost}
              value={host}
              onChange={(event) => setHost(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${definition.kind}-token-${environmentId}`}>{uiText("Token")}</Label>
            <SecretInput
              id={`${definition.kind}-token-${environmentId}`}
              size="sm"
              configured={isSaved}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {savedHosts.length === 0
              ? uiText("No token saved; the server uses {0} or the {1} login.", {
                  0: credentials.tokenEnvVar,
                  1: credentials.cliName,
                })
              : uiText("Saved for {0}.", { "0": savedHosts.join(", ") })}
          </p>
          <div className="flex shrink-0 gap-2">
            {isSaved ? (
              <Button
                size="xs"
                variant="outline"
                disabled={saving}
                onClick={() => void save(normalizedHost, "")}
              >
                {uiText("Remove")}
              </Button>
            ) : null}
            <Button type="submit" size="xs" disabled={!normalizedHost || !draft.trim() || saving}>
              {uiText("Save")}
            </Button>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
