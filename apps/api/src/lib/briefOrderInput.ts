import { z } from 'zod';
import {
  BRIEF_CONTACT_METHODS,
  parseBriefContact,
  parseBriefTarget,
  type BriefContactMethod,
  type BriefTargetKind,
} from '@chainward/common';
import { AppError } from '../middleware/errorHandler.js';

// The order's target and contact reach the Claude run that writes the brief
// (scripts/fulfill-briefs.ts), so they are checked against strict shapes here and
// again by the runner. Notes stay free text: ops reads them, the model never does.
const createSchema = z.object({
  target: z.string().max(200),
  contact: z.string().max(254),
  contactMethod: z.enum(BRIEF_CONTACT_METHODS),
  notes: z.string().trim().max(2000).optional(),
});

const CONTACT_HINT: Record<BriefContactMethod, string> = {
  email: 'Enter a valid email address.',
  telegram: 'Enter a Telegram username (5 to 32 letters, digits or _) or an email address.',
  x: 'Enter an X handle (up to 15 letters, digits or _).',
  discord: 'Enter a Discord username (2 to 32 letters, digits, _ or .).',
  other: 'Enter an email address or a handle (letters, digits, _, . or -).',
};

export interface BriefOrderInput {
  target: string;
  targetKind: BriefTargetKind;
  contact: string;
  contactMethod: BriefContactMethod;
  notes: string | null;
}

export function parseCreateBriefOrder(body: unknown): BriefOrderInput {
  const { target, contact, contactMethod, notes } = createSchema.parse(body);

  const parsedTarget = parseBriefTarget(target);
  if (!parsedTarget) {
    throw new AppError(
      400,
      'INVALID_TARGET',
      'Enter a Base address (0x and 40 hex characters) or an agent handle (@name: letters, digits, _ or -, up to 40 characters).',
    );
  }

  const parsedContact = parseBriefContact(contact, contactMethod);
  if (!parsedContact) throw new AppError(400, 'INVALID_CONTACT', CONTACT_HINT[contactMethod]);

  return {
    target: parsedTarget.value,
    targetKind: parsedTarget.kind,
    contact: parsedContact,
    contactMethod,
    notes: notes || null,
  };
}
