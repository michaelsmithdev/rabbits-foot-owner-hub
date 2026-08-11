import type { IncomingMessage } from 'node:http'

export function getPublicAppUrl(request?: IncomingMessage): string
export function buildCustomerPortalUrl(token: string, request?: IncomingMessage): string
