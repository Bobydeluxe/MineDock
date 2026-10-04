import {
  useEffect,
  useLayoutEffect,
  useRef,
  useId,
  useState,
  cloneElement,
  isValidElement,
  Children,
  useContext,
  type ButtonHTMLAttributes,
  type ReactNode,
  type DependencyList,
} from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, X, AlertCircle } from 'lucide-react';
import { AppContext } from './context';
import { localizeMessage } from '../../../../packages/domain/localization';
export function Button({
  children,
  className = '',
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
}): ReactNode {
  return (
    <button type="button" {...props} className={`button ${variant} ${className}`}>
      {children}
    </button>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}): ReactNode {
  const labelControls = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (child) => {
      if (!isValidElement<{ children?: ReactNode; 'aria-label'?: string }>(child)) return child;
      if (typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type))
        return cloneElement(child, { 'aria-label': label });
      return child.props.children
        ? cloneElement(child, { children: labelControls(child.props.children) })
        : child;
    });
  return (
    <div className="field">
      <span>{label}</span>
      {labelControls(children)}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
export function Empty({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  );
}
export function ErrorBox({
  error,
  retry,
  retryLabel,
}: {
  error: string;
  retry?: () => void;
  retryLabel?: string;
}): ReactNode {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <LocalizedError error={error} />
      {retry && <Button onClick={retry}>{retryLabel}</Button>}
    </div>
  );
}
function LocalizedError({ error }: { error: string }): ReactNode {
  const context = useContext(AppContext);
  return <span>{localizeMessage(error, context?.snapshot.settings.language)}</span>;
}
export function Loading({ label }: { label: string }): ReactNode {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={20} />
      {label}
    </div>
  );
}
let activeDialogs = 0;
let previousBodyOverflow = '';
export function Dialog({
  title,
  children,
  onClose,
  closeLabel,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  closeLabel: string;
  className?: string;
}): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const titleId = useId();
  const backdropPress = useRef(false);
  const context = useContext(AppContext);
  const canClose = !!onClose && !context?.busy;
  useLayoutEffect(() => {
    const dialog = ref.current;
    const previous = opener.current;
    if (!dialog) return;
    if (activeDialogs++ === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    dialog.showModal();
    return () => {
      dialog.close();
      if (--activeDialogs === 0) document.body.style.overflow = previousBodyOverflow;
      queueMicrotask(() => {
        if (dialog.open) return;
        const target =
          previous?.isConnected && previous.getClientRects().length > 0
            ? previous
            : document.querySelector<HTMLElement>('main');
        target?.focus({ preventScroll: true });
      });
    };
  }, []);
  const outside = (event: { clientX: number; clientY: number }) => {
    const bounds = ref.current?.getBoundingClientRect();
    return (
      !!bounds &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    );
  };
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((control) => control.tabIndex >= 0 && control.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (canClose) onClose?.();
      }}
      onPointerDown={(event) => {
        backdropPress.current = outside(event);
      }}
      onPointerCancel={() => {
        backdropPress.current = false;
      }}
      onClick={(event) => {
        if (backdropPress.current && outside(event) && canClose) onClose?.();
        backdropPress.current = false;
      }}
      className={`dialog ${className}`}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        {onClose && (
          <Button
            variant="ghost"
            disabled={!canClose}
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
          >
            <X size={20} />
          </Button>
        )}
      </header>
      {context?.error && (
        <div className="dialog-error">
          <ErrorBox
            error={context.error}
            retry={context.dismissError}
            retryLabel={context.t('close')}
          />
        </div>
      )}
      {children}
    </dialog>,
    document.body,
  );
}
export function useData<T>(
  loader: () => Promise<T>,
  deps: DependencyList,
): { data: T | undefined; error: string; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    void loader()
      .then((value) => {
        if (current) setData(value);
      })
      .catch((e) => {
        if (current) setError(String((e as Error).message ?? e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [...deps, key]);
  return { data, error, loading, reload: () => setKey((k) => k + 1) };
}
export function bytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const index = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${['B', 'KB', 'MB', 'GB', 'TB'][index]}`;
}
export function duration(start?: string): string {
  if (!start) return '—';
  const minutes = Math.floor((Date.now() - Date.parse(start)) / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
export function Chart({
  values,
  label,
  color = '#98cc8b',
  suffix = '',
}: {
  values: number[];
  label: string;
  color?: string;
  suffix?: string;
}): ReactNode {
  const max = Math.max(1, ...values);
  const points = values
    .map((v, i) => `${(i * 600) / Math.max(1, values.length - 1)},${110 - (v / max) * 90}`)
    .join(' ');
  return (
    <div className="chart">
      <div className="chart-caption">
        <span>{label}</span>
        <strong>
          {values.at(-1)?.toFixed(1) ?? '—'}
          {suffix}
        </strong>
      </div>
      <svg viewBox="0 0 600 130" role="img" aria-label={label} preserveAspectRatio="none">
        <path
          d="M0 25H600 M0 65H600 M0 110H600"
          stroke="var(--border)"
          strokeDasharray="3 5"
          fill="none"
        />
        {values.length > 0 && (
          <>
            <polygon points={`0,130 ${points} 600,130`} fill={color} opacity="0.07" />
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
    </div>
  );
}
