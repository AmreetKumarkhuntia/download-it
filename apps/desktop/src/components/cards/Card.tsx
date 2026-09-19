import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export function Card({
  as: Element = 'div',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: 'article' | 'section' | 'div' | 'form' }) {
  return <Element className={clsx('card', className)} {...props} />;
}
