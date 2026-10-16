export type DirectEstimatePrice = {
  laborHours: number
  laborRate: number
  laborCost: number
  materialCost: number
  total: number
}

function money(value: number) {
  return Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 100) / 100
}

export function calculateDirectEstimatePrice(
  laborHours: number,
  laborRate: number,
  materialCost: number,
): DirectEstimatePrice {
  const normalizedHours = money(laborHours)
  const normalizedRate = money(laborRate)
  const normalizedMaterials = money(materialCost)
  const laborCost = money(normalizedHours * normalizedRate)

  return {
    laborHours: normalizedHours,
    laborRate: normalizedRate,
    laborCost,
    materialCost: normalizedMaterials,
    total: money(laborCost + normalizedMaterials),
  }
}

export function describeEstimatedDuration(laborHours: number, crewSize = 1) {
  const normalizedHours = money(laborHours)
  const normalizedCrewSize = Math.max(1, Math.round(crewSize || 1))
  const elapsedHours = money(normalizedHours / normalizedCrewSize)

  if (normalizedHours <= 0) return 'Time to complete needs onsite confirmation.'

  const laborLabel = normalizedHours === 1 ? 'labor hour' : 'labor hours'
  const crewLabel = normalizedCrewSize === 1 ? 'one person' : `${normalizedCrewSize} people`
  const elapsedDescription = elapsedHours <= 1
    ? 'about 1 hour onsite'
    : elapsedHours <= 8
      ? `about ${elapsedHours} hours onsite`
      : `about ${Math.ceil(elapsedHours / 8)} working days onsite`

  return `About ${normalizedHours} ${laborLabel} — ${elapsedDescription} for ${crewLabel}.`
}
