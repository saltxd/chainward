import { redirect } from 'next/navigation';

// The standalone wallet-lookup tool has been folded into the Risk-Check home
// page. Permanently send /wallet to the checker hero.
export default function WalletLookupRedirect() {
  redirect('/');
}
