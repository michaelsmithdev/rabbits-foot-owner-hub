import type { Job, JobChangeOrder } from '../types/Job'

export function approvedChangeOrderTotal(changeOrders: JobChangeOrder[]) {
  return changeOrders
    .filter((changeOrder) => changeOrder.status === 'approved')
    .reduce((sum, changeOrder) => sum + changeOrder.priceChange, 0)
}

export function jobRevenue(job: Pick<Job, 'quotedPrice' | 'changeOrders'>) {
  return job.quotedPrice + approvedChangeOrderTotal(job.changeOrders)
}
