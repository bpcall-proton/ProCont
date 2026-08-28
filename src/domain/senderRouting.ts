import type { AppState } from './types'

export type MessageChannel = 'whatsapp' | 'viber'

export type SenderRoute =
  | {
      status: 'matched'
      companyId: string
      storeId: string
      sellerId: string
      accountingSellerId: string
    }
  | { status: 'not-found' | 'ambiguous' }

export function normalizeSenderPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('00') ? digits.slice(2) : digits
}

export function resolveSenderRoute(
  state: AppState,
  senderPhone: string,
  channel: MessageChannel,
): SenderRoute {
  const phone = normalizeSenderPhone(senderPhone)
  if (!phone) return { status: 'not-found' }

  const sellers = state.sellers.filter(
    (seller) =>
      normalizeSenderPhone(seller.phone) === phone &&
      (channel === 'whatsapp'
        ? seller.whatsappEnabled
        : seller.viberEnabled),
  )
  const routes = sellers.flatMap((seller) =>
    state.stores
      .filter(
        (store) =>
          store.sellerId === seller.id &&
          store.companyId === seller.companyId,
      )
      .map((store) => ({
        status: 'matched' as const,
        companyId: store.companyId,
        storeId: store.id,
        sellerId: seller.id,
        accountingSellerId: seller.accountingSellerId,
      })),
  )

  if (routes.length === 0) return { status: 'not-found' }
  if (routes.length > 1) return { status: 'ambiguous' }
  return routes[0]
}
