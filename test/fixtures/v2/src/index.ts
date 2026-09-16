export interface ButtonProps {
  variant?: 'default' | 'danger';
  /** @deprecated Use density instead. */
  size: 'sm' | 'md' | 'lg';
}
export function Button(_props: ButtonProps): null { return null; }
declare function memo<T>(component: T): T;
declare function forwardRef<P>(render: (props: P, ref: unknown) => null): (props: P & { ref?: unknown }) => null;
export const MemoButton = memo((_props: { emphasis?: 'low' | 'high' }) => null);
export const RefButton = forwardRef((_props: { label: string }, _ref: unknown) => null);
