export const APP_SETTINGS = Object.freeze({
  business: Object.freeze({
    contactVersion: 2,
    name: "Rabbit's Foot Handyman Services",
    email: 'callrabbitsfoot@gmail.com',
    phone: Object.freeze({
      display: '(574) 334-8410',
      digits: '5743348410',
      tel: 'tel:5743348410',
      sms: 'sms:5743348410',
    }),
    googleReviewUrl: 'https://g.page/r/CUF3RlgX_N3XEBM/review',
  }),
})

export function resolveBusinessPhone(phone, contactVersion) {
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
