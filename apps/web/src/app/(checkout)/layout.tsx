import { CheckoutShell } from './checkout-shell';

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <CheckoutShell>{children}</CheckoutShell>;
}
