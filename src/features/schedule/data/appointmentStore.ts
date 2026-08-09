import { queueCollectionSync } from '../../cloud/syncQueue.ts'
import type { Appointment, AppointmentStatus } from '../types/Appointment.ts'

const STORAGE_KEY = 'rabbits-foot-appointments'
const statuses: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'en_route',
  'arrived',
  'completed',
  'canceled',
]

function isAppointment(value: unknown): value is Appointment {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Appointment>
  return Boolean(
    typeof item.id === 'string' &&
    typeof item.customerId === 'string' &&
    typeof item.title === 'string' &&
    typeof item.serviceAddress === 'string' &&
    typeof item.startAt === 'string' &&
    typeof item.endAt === 'string' &&
    typeof item.status === 'string' &&
    statuses.includes(item.status as AppointmentStatus) &&
    typeof item.notes === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string',
  )
}

export function loadAppointments(): Appointment[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter(isAppointment).sort((a, b) => a.startAt.localeCompare(b.startAt))
      : []
  } catch {
    return []
  }
}

export function saveAppointments(appointments: Appointment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments))
  queueCollectionSync('appointment', appointments)
}

export function appointmentConflicts(
  appointments: Appointment[],
  candidate: Pick<Appointment, 'id' | 'startAt' | 'endAt' | 'status'>,
) {
  if (candidate.status === 'canceled') return []
  const start = new Date(candidate.startAt).getTime()
  const end = new Date(candidate.endAt).getTime()

  return appointments.filter((item) => {
    if (item.id === candidate.id || item.status === 'canceled') return false
    return start < new Date(item.endAt).getTime() && end > new Date(item.startAt).getTime()
  })
}
