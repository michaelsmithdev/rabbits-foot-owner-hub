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

export function resolveBusinessPhone() {
  return { ...APP_SETTINGS.business.phone }
}
