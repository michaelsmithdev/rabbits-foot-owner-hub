export type CommunicationChannel = 'email' | 'sms' | 'system'
export type CommunicationStatus = 'drafted' | 'copied' | 'sent' | 'delivered' | 'failed'

export type Communication = {
  id: string
  customerId: string
  appointmentId?: string
  documentId?: string
  channel: CommunicationChannel
  kind: 'appointment_confirmation' | 'appointment_reminder' | 'on_my_way' | 'estimate_follow_up' | 'invoice_reminder' | 'review_request' | 'custom'
  status: CommunicationStatus
  subject: string
  body: string
  createdAt: string
  sentAt?: string
}
