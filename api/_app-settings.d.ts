export type BusinessPhoneContact = {
  display: string
  digits: string
  tel: string
  sms: string
}

export const APP_SETTINGS: Readonly<{
  business: Readonly<{
    contactVersion: number
    name: string
    email: string
    phone: Readonly<BusinessPhoneContact>
    googleReviewUrl: string
  }>
}>

export function resolveBusinessPhone(
  phone: unknown,
  contactVersion: unknown,
): BusinessPhoneContact
