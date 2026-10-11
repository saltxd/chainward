import { permanentRedirect } from 'next/navigation';

// Sign-up and sign-in are one wallet step; /register only survives as a redirect.
export default function RegisterPage() {
  permanentRedirect('/login');
}
