import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { deleteAudioBlob, loadAudioBlob, saveAudioBlob } from '../data/audioBlobStore'
import { transcribeAudio } from '../services/transcriptionService'
import type { VoiceNote } from '../types/VoiceNote'
import './VoiceCapture.css'

type Props = {
  notes: VoiceNote[]
  onChange: (notes: VoiceNote[]) => void
  label?: string
}

const MAX_RECORDING_SECONDS = 90

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function VoiceCapture({ notes, onChange, label = 'Talk through the job' }: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const cancelledRef = useRef(false)
  const notesRef = useRef(notes)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => {
      const nextElapsed = Math.floor((Date.now() - startedAtRef.current) / 1000)
      setElapsed(nextElapsed)
      if (nextElapsed >= MAX_RECORDING_SECONDS) recorderRef.current?.stop()
    }, 250)

    return () => window.clearInterval(timer)
  }, [recording])

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), [])

  async function transcribeSavedNote(note: VoiceNote) {
    const blob = await loadAudioBlob(note.id)
    if (!blob) {
      setError('The original recording is not available on this device.')
      return
    }

    onChange(notesRef.current.map((item) => item.id === note.id ? { ...item, state: 'transcribing' } : item))
    try {
      const transcript = await transcribeAudio(blob, note.fileName)
      onChange(notesRef.current.map((item) => item.id === note.id ? { ...item, transcript, state: 'complete' } : item))
      setError('')
    } catch (transcriptionError) {
      onChange(notesRef.current.map((item) => item.id === note.id ? { ...item, state: 'error' } : item))
      setError(transcriptionError instanceof Error ? transcriptionError.message : 'Transcription failed.')
    }
  }

  async function startRecording() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording is not supported on this device. Type a note instead.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      const preferredType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const id = createId()
        const extension = mimeType.includes('mp4') ? 'm4a' : 'webm'
        const note: VoiceNote = {
          id,
          fileName: `owner-hub-${Date.now()}.${extension}`,
          mimeType,
          durationSeconds: Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000)),
          transcript: '',
          createdAt: new Date().toISOString(),
          state: 'saved',
        }
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        setRecording(false)
        setElapsed(0)

        if (cancelledRef.current) {
          chunksRef.current = []
          cancelledRef.current = false
          setError('Recording canceled before it was saved.')
          return
        }

        try {
          await saveAudioBlob(id, blob)
          const nextNotes = [...notesRef.current.filter((item) => item.id !== note.id), { ...note, state: 'transcribing' as const }]
          onChange(nextNotes)
          const transcript = await transcribeAudio(blob, note.fileName)
          onChange([...notesRef.current.filter((item) => item.id !== note.id), { ...note, transcript, state: 'complete' }])
        } catch (recordingError) {
          onChange([...notesRef.current.filter((item) => item.id !== note.id), { ...note, state: 'error' }])
          setError(recordingError instanceof Error ? recordingError.message : 'The recording was saved but could not be transcribed.')
        }
      }
      streamRef.current = stream
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      cancelledRef.current = false
      recorder.start(500)
      setRecording(true)
      setElapsed(0)
    } catch {
      setError('Microphone access was not granted. Allow microphone access or type a note.')
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  function cancelRecording() {
    cancelledRef.current = true
    stopRecording()
  }

  async function removeVoiceNote(noteId: string) {
    onChange(notesRef.current.filter((item) => item.id !== noteId))
    try {
      await deleteAudioBlob(noteId)
    } catch {
      setError('The note was removed, but its local audio file could not be cleaned up.')
    }
  }

  function editTranscript(noteId: string, transcript: string) {
    onChange(notesRef.current.map((item) => item.id === noteId ? { ...item, transcript } : item))
  }

  return (
    <div className="voice-capture">
      <div className="voice-record-actions">
        <button className={recording ? 'voice-button is-recording' : 'voice-button'} onClick={recording ? stopRecording : () => void startRecording()} type="button">
          {recording ? <Square size={20} /> : <Mic size={20} />}
          {recording ? `Finish ${formatElapsed(elapsed)}` : label}
        </button>
        {recording && <button className="voice-cancel-button" onClick={cancelRecording} type="button"><Trash2 size={18} /> Cancel</button>}
      </div>
      {recording && <span className="voice-limit">Listening · recording safely · stops at {formatElapsed(MAX_RECORDING_SECONDS)}</span>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notes.map((note) => (
        <article className="voice-note" key={note.id}>
          <div>
            {note.state === 'complete' ? (
              <label className="voice-transcript-review">
                <span>Review transcript—especially measurements</span>
                <textarea aria-label="Editable voice transcript" onChange={(event) => editTranscript(note.id, event.target.value)} rows={3} value={note.transcript}/>
              </label>
            ) : <strong>{note.state === 'transcribing' ? 'Transcribing saved audio…' : note.transcript || 'Recording saved for retry'}</strong>}
            <span>{formatElapsed(note.durationSeconds)} · {new Date(note.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <div className="voice-note-actions">
            {(note.state === 'error' || note.state === 'complete') && <button aria-label="Retry transcription" onClick={() => void transcribeSavedNote(note)} type="button"><RotateCcw size={17} /></button>}
            <button aria-label="Remove voice note" onClick={() => void removeVoiceNote(note.id)} type="button"><Trash2 size={17} /></button>
          </div>
        </article>
      ))}
    </div>
  )
}
