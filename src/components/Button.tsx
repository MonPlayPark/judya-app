import { forwardRef, type ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'dangerOutline' };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', className, type = 'button', ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={`${styles.button} ${styles[variant]} ${className ?? ''}`} {...rest} />;
});
