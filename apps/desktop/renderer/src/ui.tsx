import {
  useEffect,
  useRef,
  useState,
  cloneElement,
  isValidElement,
  Children,
  useContext,
  type ButtonHTMLAttributes,
  type ReactNode,
  type DependencyList,
} from 'react';
import { LoaderCircle, X, AlertCircle } from 'lucide-react';
import { AppContext } from './context';
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
      <span>{error}</span>
      {retry && <Button onClick={retry}>{retryLabel}</Button>}
    </div>
  );
}
export function Loading({ label }: { label: string }): ReactNode {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={20} />
      {label}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  closeLabel,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  closeLabel: string;
}): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  const context = useContext(AppContext);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      className="dialog"
    >
      <header>
        <h2>{title}</h2>
        {onClose && (
          <Button variant="ghost" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
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
    </dialog>
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
  if (!value) return '0 Mo';
  const unit = value >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2;
  return `${(value / unit).toFixed(1)} ${unit === 1024 ** 3 ? 'Go' : 'Mo'}`;
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
