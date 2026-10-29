import type { OrderStatus } from '@tavern/shared';
import { AppError } from '../common/http.js';
import type { Settings } from '../db/database.module.js';

export type Actor = 'customer' | 'companion' | 'admin' | 'system';

/** Allowed transitions and who may perform each. Anything not listed is rejected. */
export const TRANSITIONS: Partial<Record<OrderStatus, Partial<Record<OrderStatus, Actor[]>>>> = {
  pending_payment: { pending_acceptance: ['system'], cancelled: ['customer', 'system'] },
  pending_acceptance: { accepted: ['companion'], declined: ['companion'], cancelled: ['customer', 'system', 'admin'] },
  accepted: { in_progress: ['companion'], cancelled: ['customer', 'companion', 'admin'] },
  in_progress: { completed: ['customer', 'companion', 'system'], disputed: ['customer'], extension_requested: ['customer'] },
  extension_requested: { in_progress: ['companion', 'system'] },
  completed: { disputed: ['customer'] },
  disputed: { completed: ['admin'], refunded: ['admin'], refund_pending: ['admin'] },
  refund_pending: { refunded: ['admin'] },
};

export function assertTransition(from: OrderStatus, to: OrderStatus, actor: Actor) {
  const allowed = TRANSITIONS[from]?.[to];
  if (!allowed) throw new AppError(409, 'INVALID_TRANSITION', `Order cannot move from ${from} to ${to}`);
  if (!allowed.includes(actor)) throw new AppError(403, 'FORBIDDEN', `You cannot move this order to ${to}`);
}

export function priceOrder(pricePerUnitCentavos: number, units: number, s: Pick<Settings, 'commissionPercent' | 'serviceFeePercent' | 'coinValueCentavos'>) {
  const subtotal = pricePerUnitCentavos * units;
  const serviceFee = Math.round((subtotal * s.serviceFeePercent) / 100);
  const total = subtotal + serviceFee;
  const commission = Math.round((subtotal * s.commissionPercent) / 100);
  return {
    subtotal,
    serviceFee,
    total,
    commissionPercent: s.commissionPercent,
    commission,
    companionEarning: subtotal - commission,
    coins: Math.ceil(total / s.coinValueCentavos),
  };
}

