import type { IncomingMessage, ServerResponse } from 'node:http'

export function isAllowedOrigin(origin: string | undefined): boolean
export function applyCors(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  methods: string,
): boolean
export function requestedOrganizationId(
  request: IncomingMessage,
): string | null
