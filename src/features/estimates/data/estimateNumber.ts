export function nextEstimateNumber(
  estimateNumbers: string[],
  prefix = 'EST',
) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const usedNumbers = estimateNumbers
    .map((estimateNumber) => {
      const match = estimateNumber.match(
        new RegExp(`^${escapedPrefix}-(\\d+)(?:-R\\d+)?$`),
      )
      return match ? Number(match[1]) : null
    })
    .filter((number): number is number => number !== null && Number.isFinite(number))
  const nextNumber = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1

  return `${prefix}-${String(nextNumber).padStart(4, '0')}`
}
