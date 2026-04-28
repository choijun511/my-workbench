import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

// === Imperative dialog API ===

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOptions {
  title: string;
  body?: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useConfirm must be used inside <DialogProvider>');
  return ctx.confirm;
}
export function usePrompt() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('usePrompt must be used inside <DialogProvider>');
  return ctx.prompt;
}

type ConfirmReq = ConfirmOptions & { kind: 'confirm'; resolve: (v: boolean) => void };
type PromptReq = PromptOptions & { kind: 'prompt'; resolve: (v: string | null) => void };
type Req = ConfirmReq | PromptReq;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Req | null>(null);
  const [textValue, setTextValue] = useState('');

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setReq({ ...opts, kind: 'confirm', resolve });
    });
  }, []);

  const prompt = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setTextValue(opts.defaultValue || '');
      setReq({ ...opts, kind: 'prompt', resolve });
    });
  }, []);

  const close = (result?: boolean | string | null) => {
    if (!req) return;
    if (req.kind === 'confirm') {
      req.resolve(typeof result === 'boolean' ? result : false);
    } else {
      req.resolve(typeof result === 'string' ? result : null);
    }
    setReq(null);
  };

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(req.kind === 'confirm' ? false : null);
      } else if (e.key === 'Enter' && req.kind === 'confirm') {
        e.preventDefault();
        close(true);
      } else if (e.key === 'Enter' && req.kind === 'prompt' && !req.multiline && !e.shiftKey) {
        e.preventDefault();
        close(textValue);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req, textValue]);

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {req && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm backdrop-enter" onClick={() => close(req.kind === 'confirm' ? false : null)}>
          <div
            className="bg-card border border-velvet rounded-xl shadow-2xl w-full max-w-md grain modal-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-velvet">
              <h2 className={`text-base font-semibold ${req.kind === 'confirm' && req.danger ? 'text-blood' : 'text-bone'}`}>
                {req.title}
              </h2>
              <button
                onClick={() => close(req.kind === 'confirm' ? false : null)}
                className="text-haze hover:text-cream"
              >
                <X size={16} />
              </button>
            </div>
            {req.body && <p className="px-5 pt-3 text-sm text-haze">{req.body}</p>}
            {req.kind === 'prompt' && (
              <div className="px-5 pt-3">
                {req.multiline ? (
                  <textarea
                    autoFocus
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder={req.placeholder}
                    rows={4}
                    className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent text-cream"
                  />
                ) : (
                  <input
                    autoFocus
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder={req.placeholder}
                    className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent text-cream"
                  />
                )}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 px-5 py-3 mt-3 border-t border-velvet bg-stage/40">
              <button
                onClick={() => close(req.kind === 'confirm' ? false : null)}
                className="px-3 py-1.5 text-sm text-haze hover:text-cream rounded"
              >
                {req.cancelLabel || '取消'}
              </button>
              <button
                onClick={() => close(req.kind === 'confirm' ? true : textValue)}
                className={`px-4 py-1.5 text-sm font-medium rounded ${
                  req.kind === 'confirm' && req.danger
                    ? 'bg-blood text-bone hover:bg-blood/90'
                    : 'bg-gold text-stage-deep btn-glow-gold hover:bg-gold/90'
                }`}
              >
                {req.confirmLabel || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

// === Generic Modal component (open/close controlled) ===

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm backdrop-enter" onClick={onClose}>
      <div
        className={`bg-card border border-velvet rounded-xl shadow-2xl w-full ${maxWidth} max-h-[85vh] flex flex-col grain modal-enter`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-velvet">
          <h2 className="text-base font-semibold text-bone">{title}</h2>
          <button onClick={onClose} className="text-haze hover:text-cream">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
