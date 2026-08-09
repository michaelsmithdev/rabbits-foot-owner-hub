const UPSELL_REQUEST = /\b(?:up[ -]?sell(?:ing)?|add[ -]?ons?|optional upgrades?|additional work suggestions?|extra work suggestions?)\b/i

const INTERNAL_PRICE_PADDING = /\b(?:overhead|profit|contingenc(?:y|ies)|mark[ -]?up|margin padding)\b/i

const STANDALONE_EXTRA_FEES: Array<{ line: RegExp; request: RegExp }> = [
  {
    line: /^(?:standard\s+)?(?:delivery|material delivery)(?:\s+(?:fee|charge|allowance))?\b/i,
    request: /\b(?:deliver|delivery)\b/i,
  },
  {
    line: /^(?:standard\s+)?(?:disposal|haul(?:ing)? away|dump)(?:\s+(?:fee|charge|allowance))?\b/i,
    request: /\b(?:dispose|disposal|haul(?:ing)? away|dump)\b/i,
  },
  {
    line: /^(?:standard\s+)?(?:cleanup|clean up)(?:\s+(?:fee|charge|allowance|labor))?\b/i,
    request: /\b(?:cleanup|clean up)\b/i,
  },
  {
    line: /^(?:standard\s+)?(?:permit|inspection)(?:\s+(?:fee|charge|allowance))?\b/i,
    request: /\b(?:permit|inspection)\b/i,
  },
  {
    line: /^(?:standard\s+)?(?:travel|trip)(?:\s+(?:fee|charge|allowance))?\b/i,
    request: /\b(?:travel|trip charge)\b/i,
  },
  {
    line: /^(?:standard\s+)?(?:service call|diagnostic)(?:\s+(?:fee|charge|allowance))?\b/i,
    request: /\b(?:service call|diagnostic)\b/i,
  },
]

export function isUpsellRequested(request: string): boolean {
  return UPSELL_REQUEST.test(request)
}

export function isExactScopeLineItemAllowed(
  request: string,
  description: string,
): boolean {
  if (INTERNAL_PRICE_PADDING.test(description)) return false

  return STANDALONE_EXTRA_FEES.every(
    ({ line, request: requestPattern }) =>
      !line.test(description.trim()) || requestPattern.test(request),
  )
}
