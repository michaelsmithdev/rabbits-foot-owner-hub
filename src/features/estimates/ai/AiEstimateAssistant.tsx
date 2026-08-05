import { Camera, Images, LoaderCircle, RefreshCw, Sparkles, X } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'

import type { Customer } from '../../customers/types/Customer'
import { queuePhotoFiles } from '../../photos/data/photoStore'
import {
  MAX_AI_ESTIMATE_PHOTOS,
  prepareEstimatePhoto,
  type PreparedEstimatePhoto,
} from './estimatePhotos'
import { useAiEstimateAssistant } from './useAiEstimateAssistant'
import type {
  AiEstimateGeneration,
  AiEstimateResult,
} from './types'

import './AiEstimateAssistant.css'

type AiEstimateAssistantProps = {
  customer: Customer | null
  customerId: string
  propertyType: 'residential' | 'commercial'
  jobCategory: string
  initialGeneration?: AiEstimateGeneration
  onGenerated: (generation: AiEstimateGeneration) => void
  onGenerationChange: (generation: AiEstimateGeneration) => void
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function numericValue(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function AiEstimateAssistant({
  customer,
  customerId,
  propertyType,
  jobCategory,
  initialGeneration,
  onGenerated,
  onGenerationChange,
}: AiEstimateAssistantProps) {
  const [jobDescription, setJobDescription] = useState(
    initialGeneration?.jobDescription ?? '',
  )
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<PreparedEstimatePhoto[]>([])
  const [photoError, setPhotoError] = useState('')
  const [isPreparingPhotos, setIsPreparingPhotos] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const { error, generate, generation, isLoading, setGeneration } =
    useAiEstimateAssistant(initialGeneration)
  const result = generation?.draft ?? null
  const canGenerate = Boolean(
    customerId && jobDescription.trim().length >= 10 && !isPreparingPhotos,
  )
  const answeredQuestions = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(answers).filter(([, answer]) => answer.trim()),
      ),
    [answers],
  )

  async function selectPhotos(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (selectedFiles.length === 0) return

    const availableSlots = MAX_AI_ESTIMATE_PHOTOS - photos.length
    if (availableSlots <= 0) {
      setPhotoError(`You can attach up to ${MAX_AI_ESTIMATE_PHOTOS} photos.`)
      return
    }

    const acceptedFiles = selectedFiles.slice(0, availableSlots)
    setPhotoError(
      selectedFiles.length > availableSlots
        ? `Only the first ${availableSlots} selected photo${availableSlots === 1 ? '' : 's'} were added.`
        : '',
    )
    setIsPreparingPhotos(true)

    try {
      const preparedPhotos = await Promise.all(
        acceptedFiles.map((file) => prepareEstimatePhoto(file)),
      )
      setPhotos((current) => [...current, ...preparedPhotos])
    } catch (selectionError) {
      setPhotoError(
        selectionError instanceof Error
          ? selectionError.message
          : 'The selected photos could not be prepared.',
      )
    } finally {
      setIsPreparingPhotos(false)
    }
  }

  function removePhoto(photoId: string) {
    setPhotos((current) => current.filter((photo) => photo.id !== photoId))
    setPhotoError('')
  }

  async function storeSelectedPhotos(): Promise<PreparedEstimatePhoto[]> {
    const unstoredPhotos = photos.filter((photo) => !photo.photoId)
    if (unstoredPhotos.length === 0) return photos

    const storedPhotos = await queuePhotoFiles(
      unstoredPhotos.map((photo) => photo.file),
      {
        customerId: customerId || null,
        jobName: jobCategory.trim() || jobDescription.trim().slice(0, 100),
        category: 'before',
        caption: 'AI estimate reference photo',
        capturedAt: new Date().toISOString(),
      },
    )
    let storedIndex = 0
    const nextPhotos = photos.map((photo) => {
      if (photo.photoId) return photo
      const nextPhoto = {
        ...photo,
        photoId: storedPhotos[storedIndex]?.id,
      }
      storedIndex += 1
      return nextPhoto
    })

    setPhotos(nextPhotos)
    return nextPhotos
  }

  async function handleGenerate() {
    if (!canGenerate || !customer) return

    let estimatePhotos: PreparedEstimatePhoto[]
    setPhotoError('')
    try {
      estimatePhotos = await storeSelectedPhotos()
    } catch (storageError) {
      setPhotoError(
        storageError instanceof Error
          ? storageError.message
          : 'The photos could not be saved.',
      )
      return
    }

    const nextGeneration = await generate({
      jobDescription,
      answers: answeredQuestions,
      customerId,
      customerCity: customer.city,
      propertyType,
      jobCategory,
      photos: estimatePhotos.map((photo) => ({
        fileName: photo.file.name,
        dataUrl: photo.dataUrl,
      })),
    })

    if (nextGeneration) {
      setAnswers({})
      const generationWithPhotos = {
        ...nextGeneration,
        photoIds: estimatePhotos.flatMap((photo) =>
          photo.photoId ? [photo.photoId] : [],
        ),
      }
      setGeneration(generationWithPhotos)
      onGenerated(generationWithPhotos)
    }
  }

  function updateResult(patch: Partial<AiEstimateResult>) {
    if (!generation) return

    const nextGeneration = {
      ...generation,
      draft: { ...generation.draft, ...patch },
    }
    setGeneration(nextGeneration)
    onGenerationChange(nextGeneration)
  }

  return (
    <section className="ai-estimate-assistant" aria-labelledby="ai-estimate-title">
      <header className="ai-estimate-header">
        <div className="ai-estimate-icon">
          <Sparkles aria-hidden="true" size={22} />
        </div>
        <div>
          <p>SMART PRICING</p>
          <h3 id="ai-estimate-title">AI Estimate Assistant</h3>
          <span>Describe the work in plain English. You keep final control.</span>
        </div>
      </header>

      <label className="ai-estimate-description">
        <span>Job description</span>
        <textarea
          disabled={isLoading}
          onChange={(event) => setJobDescription(event.target.value)}
          placeholder="Example: Replace five customer-supplied interior doors, install hinges and hardware, and paint the surrounding trim."
          rows={5}
          value={jobDescription}
        />
      </label>

      <div className="ai-estimate-photos">
        <div className="ai-estimate-photos-header">
          <div>
            <span>Job photos</span>
            <small>
              Add up to {MAX_AI_ESTIMATE_PHOTOS} photos so the AI can assess visible conditions.
            </small>
          </div>
          <strong>{photos.length}/{MAX_AI_ESTIMATE_PHOTOS}</strong>
        </div>

        <input
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose estimate photos"
          className="ai-photo-file-input"
          disabled={isLoading || isPreparingPhotos || photos.length >= MAX_AI_ESTIMATE_PHOTOS}
          multiple
          onChange={selectPhotos}
          ref={galleryInputRef}
          type="file"
        />
        <input
          accept="image/jpeg,image/png,image/webp"
          aria-label="Take an estimate photo"
          capture="environment"
          className="ai-photo-file-input"
          disabled={isLoading || isPreparingPhotos || photos.length >= MAX_AI_ESTIMATE_PHOTOS}
          onChange={selectPhotos}
          ref={cameraInputRef}
          type="file"
        />

        <div className="ai-photo-actions">
          <button
            disabled={isLoading || isPreparingPhotos || photos.length >= MAX_AI_ESTIMATE_PHOTOS}
            onClick={() => galleryInputRef.current?.click()}
            type="button"
          >
            <Images aria-hidden="true" size={18} />
            Choose photos
          </button>
          <button
            disabled={isLoading || isPreparingPhotos || photos.length >= MAX_AI_ESTIMATE_PHOTOS}
            onClick={() => cameraInputRef.current?.click()}
            type="button"
          >
            <Camera aria-hidden="true" size={18} />
            Take photo
          </button>
        </div>

        {isPreparingPhotos && (
          <p className="ai-photo-status" role="status">
            <LoaderCircle aria-hidden="true" className="ai-estimate-spinner" size={17} />
            Preparing photos securely…
          </p>
        )}

        {photos.length > 0 && (
          <div className="ai-photo-preview-grid">
            {photos.map((photo, index) => (
              <div className="ai-photo-preview" key={photo.id}>
                <img alt={`Selected job photo ${index + 1}`} src={photo.dataUrl} />
                <button
                  aria-label={`Remove photo ${index + 1}`}
                  disabled={isLoading || isPreparingPhotos}
                  onClick={() => removePhoto(photo.id)}
                  type="button"
                >
                  <X aria-hidden="true" size={16} />
                </button>
                <span>{index + 1}</span>
              </div>
            ))}
          </div>
        )}

        {photoError && (
          <p className="ai-photo-error" role="alert">{photoError}</p>
        )}
        <p className="ai-photo-guidance">
          Photos help identify visible conditions. Verify measurements and concealed work onsite.
        </p>
      </div>

      {!customerId && (
        <p className="ai-estimate-guidance">Select a customer before generating an estimate.</p>
      )}

      {result && result.questions.length > 0 && (
        <div className="ai-question-panel">
          <p className="ai-question-eyebrow">OPTIONAL PRICE REFINEMENT</p>
          <h4>Your estimate is ready. Answer only if you want it refined.</h4>
          {result.questions.map((question) => (
            <label key={question}>
              <span>{question}</span>
              <input
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [question]: event.target.value,
                  }))
                }
                placeholder="Enter your answer"
                value={answers[question] ?? ''}
              />
            </label>
          ))}
        </div>
      )}

      {error && (
        <div className="ai-estimate-error" role="alert">
          <strong>AI estimate unavailable</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="ai-estimate-actions">
        <button disabled={!canGenerate || isLoading} onClick={handleGenerate} type="button">
          {isLoading ? (
            <LoaderCircle aria-hidden="true" className="ai-estimate-spinner" size={18} />
          ) : result ? (
            <RefreshCw aria-hidden="true" size={18} />
          ) : (
            <Sparkles aria-hidden="true" size={18} />
          )}
          {isLoading
            ? 'Building professional estimate…'
            : result?.questions.length
              ? 'Refine with answers'
              : result
                ? 'Regenerate estimate'
                : 'Generate AI estimate'}
        </button>
        {generation && result && result.lineItems.length > 0 && (
          <button
            className="ai-apply-button"
            onClick={() => onGenerated(generation)}
            type="button"
          >
            Apply updated AI values
          </button>
        )}
      </div>

      {result && result.lineItems.length > 0 && (
        <div className="ai-estimate-result">
          <div className="ai-result-topline">
            <label>
              <span>Job title</span>
              <input
                onChange={(event) => updateResult({ jobTitle: event.target.value })}
                value={result.jobTitle}
              />
            </label>
            <label>
              <span>Confidence</span>
              <input
                onChange={(event) => updateResult({ confidence: event.target.value })}
                value={result.confidence}
              />
            </label>
          </div>

          <div className="ai-metric-grid">
            <label>
              <span>Suggested bid</span>
              <input
                min="0"
                onChange={(event) =>
                  updateResult({ recommendedBid: numericValue(event.target.value) })
                }
                step="0.01"
                type="number"
                value={result.recommendedBid}
              />
              <small>{formatCurrency(result.recommendedBid)}</small>
            </label>
            <label>
              <span>Labor hours</span>
              <input
                min="0"
                onChange={(event) => updateResult({ laborHours: numericValue(event.target.value) })}
                step="0.25"
                type="number"
                value={result.laborHours}
              />
            </label>
            <label>
              <span>Labor estimate</span>
              <input
                min="0"
                onChange={(event) => updateResult({ laborCost: numericValue(event.target.value) })}
                step="0.01"
                type="number"
                value={result.laborCost}
              />
            </label>
            <label>
              <span>Material estimate</span>
              <input
                min="0"
                onChange={(event) => updateResult({ materialCost: numericValue(event.target.value) })}
                step="0.01"
                type="number"
                value={result.materialCost}
              />
            </label>
            <label>
              <span>Suggested markup %</span>
              <input
                min="0"
                onChange={(event) => updateResult({ markup: numericValue(event.target.value) })}
                step="0.5"
                type="number"
                value={result.markup}
              />
            </label>
            <label>
              <span>Difficulty</span>
              <input
                onChange={(event) => updateResult({ difficulty: event.target.value })}
                value={result.difficulty}
              />
            </label>
            <label className="ai-duration-field">
              <span>Estimated completion time</span>
              <input
                onChange={(event) => updateResult({ estimatedDuration: event.target.value })}
                value={result.estimatedDuration}
              />
            </label>
          </div>

          <label className="ai-result-textarea">
            <span>Summary</span>
            <textarea
              onChange={(event) => updateResult({ summary: event.target.value })}
              rows={3}
              value={result.summary}
            />
          </label>
          <label className="ai-result-textarea">
            <span>Professional customer notes</span>
            <textarea
              onChange={(event) => updateResult({ customerNotes: event.target.value })}
              rows={3}
              value={result.customerNotes}
            />
          </label>
          <label className="ai-result-textarea">
            <span>Internal contractor notes</span>
            <textarea
              onChange={(event) => updateResult({ contractorNotes: event.target.value })}
              rows={3}
              value={result.contractorNotes}
            />
          </label>

          <div className="ai-line-item-summary">
            <div>
              <span>Suggested line items</span>
              <small>Added to the editable estimate below.</small>
            </div>
            {result.lineItems.map((item, index) => (
              <p key={`${item.description}-${index}`}>
                <span>{item.description}</span>
                <strong>{formatCurrency(item.total)}</strong>
              </p>
            ))}
          </div>

          <p className="ai-history-note">
            {generation?.historyUsed
              ? `Compared with ${generation.historyUsed} completed Rabbit's Foot job${generation.historyUsed === 1 ? '' : 's'}.`
              : 'No close completed-job match was available, so industry-standard assumptions were used.'}
          </p>
        </div>
      )}
    </section>
  )
}
