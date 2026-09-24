import { KeyRoundIcon } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useEffect, useId, useState } from 'react';
import { describeFailure } from '@/lib/failure';
import { useSearchTransport } from '@/lib/transport-context';

type KeyStatus = 'checking' | 'configured' | 'missing' | 'unavailable';

const STATUS_TEXT: Record<KeyStatus, string> = {
  checking: 'Checking…',
  configured: 'A key is configured.',
  missing: 'No key is configured yet. Searches need one.',
  unavailable: 'The search host is not connected.',
};

/**
 * The Search1API key, entered once. The key goes to the desktop host, which
 * stores it privately; the page only ever learns whether one is configured,
 * and forgets what was typed as soon as it is saved.
 */
export function SettingsButton() {
  const transport = useSearchTransport();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<KeyStatus>('checking');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fieldId = useId();

  useEffect(() => {
    if (!open) return;
    setNotice(null);
    if (!transport) {
      setStatus('unavailable');
      return;
    }
    let current = true;
    setStatus('checking');
    transport.status().then(
      (result) => current && setStatus(result.search1apiConfigured ? 'configured' : 'missing'),
      (error: unknown) => {
        if (!current) return;
        setStatus('unavailable');
        setNotice(describeFailure(error).message || null);
      }
    );
    return () => {
      current = false;
    };
  }, [open, transport]);

  const save = async () => {
    if (!transport || !draft.trim() || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await transport.setKey(draft);
      setStatus(result.search1apiConfigured ? 'configured' : 'missing');
      setNotice('Saved. The key stays with the desktop host.');
    } catch (error) {
      const failure = describeFailure(error);
      setNotice(`Could not save the key: ${failure.message || failure.code}`);
    } finally {
      setDraft('');
      setSaving(false);
    }
  };

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>
        <button
          aria-label="Search settings"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Search settings"
          type="button"
        >
          <KeyRoundIcon aria-hidden className="size-5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg outline-none"
          collisionPadding={16}
          sideOffset={8}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="font-medium" htmlFor={fieldId}>
              Search1API key
            </label>
            <p aria-live="polite" className="mt-1 text-muted-foreground">
              {STATUS_TEXT[status]}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                autoComplete="off"
                className="h-9 min-w-0 flex-1 rounded-full border border-input bg-transparent px-3 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                disabled={!transport || saving}
                id={fieldId}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={status === 'configured' ? 'Replace the key' : 'Paste your key'}
                spellCheck={false}
                type="password"
                value={draft}
              />
              <button
                className="h-9 shrink-0 rounded-full bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={!transport || saving || !draft.trim()}
                type="submit"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {notice && <p className="mt-2 text-muted-foreground">{notice}</p>}
            <p className="mt-3 text-xs text-muted-foreground">
              Search1API runs the engine searches. Get a key at{' '}
              <a className="text-link underline" href="https://www.search1api.com" rel="noreferrer" target="_blank">
                search1api.com
              </a>
              . Relevance and source choices are judged by the AI configured in Nimi.
            </p>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
