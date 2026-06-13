import type { NavLink } from './NavBar';

/**
 * Canonical nav for the Risk-Check product surface: check / reports / decodes /
 * observatory. Shared so the home, report, and library pages stay in sync.
 */
export const RISK_NAV_LINKS: NavLink[] = [
  { href: '/', label: 'check' },
  { href: '/reports', label: 'reports' },
  { href: '/decodes', label: 'decodes' },
  { href: '/base', label: 'observatory' },
];
