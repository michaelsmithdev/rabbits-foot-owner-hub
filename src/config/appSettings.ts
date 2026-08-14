export const APP_SETTINGS = {
  business: {
    contactVersion: 2,
    name: "Rabbit's Foot Handyman Services",
    email: 'callrabbitsfoot@gmail.com',
    phone: {
      display: '(574) 334-8410',
      digits: '5743348410',
      tel: 'tel:5743348410',
      sms: 'sms:5743348410',
    },
  },
} as const

export type BusinessPhoneContact = {
  display: string
  digits: string
  tel: string
  sms: string
}

export function resolveBusinessPhone(
  phone: unknown,
  contactVersion: unknown,
): BusinessPhoneContact {
  if (contactVersion !== APP_SETTINGS.business.contactVersion) {
    return { ...APP_SETTINGS.business.phone }
  }

  const rawPhone = typeof phone === 'string' ? phone.trim() : ''
  const rawDigits = rawPhone.replace(/\D/g, '')
  const digits = rawDigits.length === 11 && rawDigits.startsWith('1')
    ? rawDigits.slice(1)
    : rawDigits

  if (digits.length !== 10) {
    return { ...APP_SETTINGS.business.phone }
  }

  const display = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`

  return {
    display,
    digits,
    tel: `tel:${digits}`,
    sms: `sms:${digits}`,
  }
}
