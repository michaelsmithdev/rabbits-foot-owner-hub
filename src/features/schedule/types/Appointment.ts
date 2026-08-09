export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'canceled'

export type Appointment = {
  id: string
  customerId: string
  jobId?: string
  estimateId?: string
  title: string
  serviceAddress: string
  startAt: string
  endAt: string
  status: AppointmentStatus
  notes: string
  reminderSentAt?: string
  createdAt: string
  updatedAt: string
}
