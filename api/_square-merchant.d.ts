export type SquareMerchantCredentials = {
  token: string
  locationId: string
  baseUrl: string
}

export function getSquareMerchantCredentials(
  organizationId: string,
): Promise<SquareMerchantCredentials>
