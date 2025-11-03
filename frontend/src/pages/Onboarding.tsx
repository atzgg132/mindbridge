import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { onboardingApi } from '../api/onboarding'
import Avatar from '../components/Avatar'
import { useAuthStore } from '../store/authStore'
import type { OnboardingData, OnboardingSubmission, WellbeingAnswers } from '../types'

type ViewMode = 'welcome' | 'resume' | 'form' | 'success' | 'high'

interface FormState {
  topics: string[]
  otherTopic: string
  participationStyle: string
  availability: string
  wellbeing: WellbeingAnswers
  consentAccepted: boolean
  contactOk: boolean
}

const CONSENT_VERSION = '1.0'
const REQUIRED_MESSAGE = 'Please complete this field.'
const CONSENT_MESSAGE = 'You need to accept to continue.'

const TOPIC_OPTIONS = [
  'Exam stress',
  'Anxiety',
  'Low mood',
  'Motivation',
  'Sleep issues',
  'Relationship stress',
  'Adjustment to college',
  'Other',
]

const PARTICIPATION_OPTIONS = [
  'Mostly listen',
  'Share & get support',
  'Learn coping tools',
  'Not sure yet',
]

const AVAILABILITY_OPTIONS = ['Morning', 'Afternoon', 'Evening']

const WELLBEING_QUESTIONS = [
  {
    key: 'littleInterest' as const,
    label: 'Little interest or pleasure in doing things?',
  },
  {
    key: 'feelingDown' as const,
    label: 'Feeling down, depressed, or hopeless?',
  },
  {
    key: 'feelingNervous' as const,
    label: 'Feeling nervous, anxious, or on edge?',
  },
  {
    key: 'worrying' as const,
    label: 'Not being able to stop or control worrying?',
  },
]

const WELLBEING_SCALE = [
  { value: 0, label: 'Not at all', hint: '(0)' },
  { value: 1, label: 'Several days', hint: '(1)' },
  { value: 2, label: 'More than half the days', hint: '(2)' },
  { value: 3, label: 'Nearly every day', hint: '(3)' },
]

const INITIAL_FORM: FormState = {
  topics: [],
  otherTopic: '',
  participationStyle: '',
  availability: '',
  wellbeing: {
    littleInterest: null,
    feelingDown: null,
    feelingNervous: null,
    worrying: null,
  },
  consentAccepted: false,
  contactOk: true,
}

const logDebug = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[Onboarding]', ...args)
  }
}

export default function Onboarding() {
  const { user, setUser, logout } = useAuthStore()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [view, setView] = useState<ViewMode>('welcome')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [serverResult, setServerResult] = useState<OnboardingData | null>(null)
  const [showGuidelines, setShowGuidelines] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const [hasHydrated, setHasHydrated] = useState(false)

  const draftKey = useMemo(() => (user ? `mindbridge:onboarding:${user.id}` : null), [user?.id])
  const hasLoadedDraft = useRef(false)

  const hasFormProgress = (formData: FormState): boolean => {
    return (
      formData.topics.length > 0 ||
      formData.participationStyle !== '' ||
      formData.availability !== '' ||
      Object.values(formData.wellbeing).some(value => value !== null)
    )
  }

  useEffect(() => {
    if (!user) return
    if (user.role === 'MODERATOR') {
      navigate('/dashboard', { replace: true })
      return
    }

    if (user.onboardingCompleted && !justCompleted) {
      navigate('/dashboard', { replace: true })
      return
    }
  }, [user, navigate, justCompleted])

  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      logDebug('Starting onboarding data load')

      try {
        // Try to load from API first
        const apiData = await onboardingApi.get()

        if (apiData && apiData.onboardingDone) {
          logDebug('Received completed onboarding from API', apiData)
          setServerResult(apiData)
          setForm({
            topics: apiData.topics,
            otherTopic: apiData.otherTopic ?? '',
            participationStyle: apiData.participationStyle,
            availability: apiData.availability,
            wellbeing: {
              littleInterest: apiData.wellbeing.littleInterest,
              feelingDown: apiData.wellbeing.feelingDown,
              feelingNervous: apiData.wellbeing.feelingNervous,
              worrying: apiData.wellbeing.worrying,
            },
            consentAccepted: true,
            contactOk: apiData.contactOk,
          })
        } else {
          // Load draft from localStorage if exists
          if (draftKey) {
            try {
              const draft = localStorage.getItem(draftKey)
              if (draft) {
                const parsed = JSON.parse(draft) as FormState
                setForm(parsed)
                logDebug('Draft loaded from storage', parsed)
                // Check if there's meaningful progress
                if (hasFormProgress(parsed)) {
                  setView('resume')
                }
              }
            } catch (error) {
              logDebug('Failed to parse draft', error)
              localStorage.removeItem(draftKey)
            }
          }
        }
      } catch (error) {
        logDebug('API fetch failed', error)
        // Try to load draft on error
        if (draftKey) {
          try {
            const draft = localStorage.getItem(draftKey)
            if (draft) {
              const parsed = JSON.parse(draft) as FormState
              setForm(parsed)
              logDebug('Draft loaded from storage after API error', parsed)
              // Check if there's meaningful progress
              if (hasFormProgress(parsed)) {
                setView('resume')
              }
            }
          } catch (e) {
            logDebug('Failed to parse draft', e)
          }
        }
      } finally {
        logDebug('Data load complete, hiding loader')
        setIsLoading(false)
        setHasHydrated(true)
      }
    }

    loadData()
  }, [user?.id, draftKey])

  useEffect(() => {
    if (!draftKey || (view !== 'form' && view !== 'welcome' && view !== 'resume') || !hasHydrated) return
    logDebug('Persisting draft to storage', form)
    localStorage.setItem(draftKey, JSON.stringify(form))
  }, [form, draftKey, view, hasHydrated])

  const toggleTopic = (topic: string) => {
    setForm(prev => {
      const exists = prev.topics.includes(topic)
      const updatedTopics = exists ? prev.topics.filter(item => item !== topic) : [...prev.topics, topic]
      return {
        ...prev,
        topics: updatedTopics,
        otherTopic: topic === 'Other' && exists ? '' : prev.otherTopic,
      }
    })
    setHasHydrated(true)
    setFieldErrors(prev => {
      const next = { ...prev }
      delete next.topics
      return next
    })
  }

  const selectParticipation = (value: string) => {
    setForm(prev => ({ ...prev, participationStyle: value }))
    setHasHydrated(true)
    setFieldErrors(prev => {
      const next = { ...prev }
      delete next.participationStyle
      return next
    })
  }

  const selectAvailability = (value: string) => {
    setForm(prev => ({ ...prev, availability: value }))
    setHasHydrated(true)
    setFieldErrors(prev => {
      const next = { ...prev }
      delete next.availability
      return next
    })
  }

  const selectWellbeing = (questionKey: keyof WellbeingAnswers, score: number) => {
    setForm(prev => ({
      ...prev,
      wellbeing: {
        ...prev.wellbeing,
        [questionKey]: score,
      },
    }))
    setHasHydrated(true)
    setFieldErrors(prev => {
      const next = { ...prev }
      delete next[`wellbeing.${questionKey}`]
      return next
    })
  }

  const isFormComplete = useMemo(() => {
    const wellbeingComplete = Object.values(form.wellbeing).every(value => value !== null)
    const hasTopics = form.topics.length > 0
    return (
      hasTopics &&
      !!form.participationStyle &&
      !!form.availability &&
      wellbeingComplete &&
      form.consentAccepted
    )
  }, [form])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return

    const nextErrors: Record<string, string> = {}
    if (form.topics.length === 0) {
      nextErrors.topics = REQUIRED_MESSAGE
    }
    if (!form.participationStyle) {
      nextErrors.participationStyle = REQUIRED_MESSAGE
    }
    if (!form.availability) {
      nextErrors.availability = REQUIRED_MESSAGE
    }
    Object.entries(form.wellbeing).forEach(([key, value]) => {
      if (value === null) {
        nextErrors[`wellbeing.${key}`] = REQUIRED_MESSAGE
      }
    })
    if (!form.consentAccepted) {
      nextErrors.consent = CONSENT_MESSAGE
    }

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    const wellbeingPayload = {
      littleInterest: form.wellbeing.littleInterest ?? 0,
      feelingDown: form.wellbeing.feelingDown ?? 0,
      feelingNervous: form.wellbeing.feelingNervous ?? 0,
      worrying: form.wellbeing.worrying ?? 0,
    }

    const submission: OnboardingSubmission = {
      topics: form.topics,
      otherTopic: form.topics.includes('Other') ? form.otherTopic.trim() : '',
      participationStyle: form.participationStyle,
      availability: form.availability,
      wellbeing: wellbeingPayload,
      consentAccepted: form.consentAccepted,
      consentVersion: CONSENT_VERSION,
      contactOk: form.contactOk,
    }

    setSubmitError('')
    setIsSubmitting(true)
    try {
      const { data, token } = await onboardingApi.submit(submission)

      // Save the new token if provided
      if (token) {
        localStorage.setItem('auth_token', token)
      }

      setServerResult(data)
      setView(data.screeningResult === 'high' ? 'high' : 'success')
      setJustCompleted(true)
      if (user) {
        setUser({ ...user, onboardingCompleted: true })
      }
      if (draftKey) {
        localStorage.removeItem(draftKey)
      }
    } catch (error: any) {
      setSubmitError(
        error?.response?.data?.error ?? 'Something went wrong. Please try again in a moment.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNavigate = (path: string) => {
    navigate(path, { replace: true })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <div className="h-12 w-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading your onboarding...</p>
        </motion.div>
      </div>
    )
  }

  const handleLogout = () => {
    logout()
    navigate('/signin')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <header className="bg-white/90 backdrop-blur border-b border-indigo-100/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              MindBridge
            </h1>
            <span className="hidden text-sm font-medium text-indigo-700 sm:inline">
              Let’s get you settled
            </span>
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <div className="hidden text-right text-sm text-slate-600 sm:block">
                <p className="font-semibold text-slate-800">{user.fullName}</p>
                <p className="text-xs">{user.email}</p>
              </div>
              <Avatar
                name={user.fullName}
                profilePicture={user.profilePicture}
                size="sm"
                className="ring-2 ring-indigo-500/80"
              />
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {view === 'welcome' && (
            <motion.div
              key="welcome-screen"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="space-y-8"
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="rounded-2xl border border-white/60 bg-white/90 p-8 shadow-lg backdrop-blur text-center"
              >
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 20 }}
                  className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500"
                >
                  <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </motion.div>
                <motion.h1
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-4xl font-bold text-gray-900 mb-3"
                >
                  Welcome to{' '}
                  <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    MindBridge
                  </span>
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-lg text-gray-600 max-w-2xl mx-auto"
                >
                  Let's take a few minutes to get you settled into your supportive circle
                </motion.p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="rounded-2xl border border-white/60 bg-white/90 p-8 shadow-lg backdrop-blur"
              >
                <h2 className="text-2xl font-semibold text-gray-900 mb-6">What to expect</h2>
                <div className="space-y-6">
                  {[
                    {
                      icon: (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      ),
                      title: 'Quick setup',
                      description: 'Takes about 2 minutes to complete'
                    },
                    {
                      icon: (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      ),
                      title: 'Safe & private',
                      description: 'Your responses help us match you to the right circle'
                    },
                    {
                      icon: (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      ),
                      title: 'Personalized matching',
                      description: 'Join a small peer circle with others who understand'
                    }
                  ].map((item, index) => (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
                      className="flex gap-4"
                    >
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {item.icon}
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                        <p className="text-gray-600 mt-1">{item.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 0.4 }}
                className="flex justify-center pt-4"
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setView('form')}
                  className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-shadow"
                >
                  Start Onboarding
                </motion.button>
              </motion.div>
            </motion.div>
          )}

          {view === 'resume' && (
            <motion.div
              key="resume-screen"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="space-y-8"
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="rounded-2xl border border-white/60 bg-white/90 p-8 shadow-lg backdrop-blur text-center"
              >
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 20 }}
                  className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500"
                >
                  <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </motion.div>
                <motion.h1
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-4xl font-bold text-gray-900 mb-3"
                >
                  Welcome back!
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-lg text-gray-600 max-w-2xl mx-auto"
                >
                  You've already started your onboarding. Let's pick up where you left off.
                </motion.p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="rounded-2xl border border-white/60 bg-white/90 p-8 shadow-lg backdrop-blur"
              >
                <h2 className="text-2xl font-semibold text-gray-900 mb-6">Your Progress</h2>
                <div className="space-y-4">
                  {(() => {
                    const wellbeingAnswers = Object.values(form.wellbeing).filter(v => v !== null)
                    const wellbeingProgress = wellbeingAnswers.length === 4 ? 'complete' : wellbeingAnswers.length > 0 ? 'partial' : 'empty'

                    const items = [
                      {
                        label: 'Topics selected',
                        status: form.topics.length > 0 ? 'complete' : 'empty'
                      },
                      {
                        label: 'Participation style',
                        status: form.participationStyle !== '' ? 'complete' : 'empty'
                      },
                      {
                        label: 'Availability preference',
                        status: form.availability !== '' ? 'complete' : 'empty'
                      },
                      {
                        label: 'Wellbeing check-in',
                        status: wellbeingProgress,
                        detail: wellbeingProgress === 'partial' ? `${wellbeingAnswers.length}/4 questions` : undefined
                      },
                      {
                        label: 'Safety & consent',
                        status: form.consentAccepted ? 'complete' : 'empty'
                      },
                    ]

                    return items.map((item, index) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
                        className="flex items-center gap-3"
                      >
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                          item.status === 'complete'
                            ? 'bg-green-100 text-green-600'
                            : item.status === 'partial'
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          {item.status === 'complete' ? '✓' : item.status === 'partial' ? '◐' : '○'}
                        </div>
                        <div className="flex-1">
                          <span className={`text-base ${
                            item.status === 'complete' ? 'text-gray-900 font-medium' :
                            item.status === 'partial' ? 'text-gray-700' :
                            'text-gray-500'
                          }`}>
                            {item.label}
                          </span>
                          {item.detail && (
                            <span className="ml-2 text-sm text-amber-600">
                              ({item.detail})
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))
                  })()}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.4 }}
                className="flex justify-center gap-4 pt-4"
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (draftKey) {
                      localStorage.removeItem(draftKey)
                    }
                    setForm(INITIAL_FORM)
                    setView('welcome')
                  }}
                  className="px-6 py-3 bg-white text-indigo-600 border-2 border-indigo-600 rounded-xl font-semibold hover:bg-indigo-50 transition-all"
                >
                  Start Over
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setView('form')}
                  className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-shadow"
                >
                  Continue Onboarding
                </motion.button>
              </motion.div>
            </motion.div>
          )}

          {view === 'form' && (
            <motion.div
              key="onboarding-form-wrapper"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-md backdrop-blur"
              >
                <h2 className="text-3xl font-semibold text-slate-900">Let's get you settled</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">
                  This takes ~2 minutes. Your responses help us match you to a supportive circle.
                </p>
              </motion.div>

              <motion.form
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="space-y-6"
                onSubmit={handleSubmit}
              >
                {submitError && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
                  >
                    {submitError}
                  </motion.div>
                )}

                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                  className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur"
                >
                <h2 className="text-lg font-semibold text-slate-900">About you</h2>
                <p className="mt-1 text-sm text-slate-600">
                  We’ll use this to personalise your circle experience.
                </p>

                <div className="mt-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-800">
                      What brings you here today?
                    </label>
                    <p className="mt-1 text-xs text-slate-500">
                      Choose all that resonate; we’ll keep it private.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                    {TOPIC_OPTIONS.map(option => {
                      const isActive = form.topics.includes(option)
                      return (
                        <button
                          key={option}
                            type="button"
                            onClick={() => toggleTopic(option)}
                            className={`rounded-full border px-4 py-2 text-sm transition-all ${
                              isActive
                                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 shadow-sm'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                            }`}
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>
                    {form.topics.includes('Other') && (
                    <div className="mt-4 max-w-md">
                      <label className="block text-xs font-medium text-slate-600">
                        Add a few words (optional)
                      </label>
                      <input
                        type="text"
                        value={form.otherTopic}
                        onChange={event => {
                          setHasHydrated(true)
                          setForm(prev => ({ ...prev, otherTopic: event.target.value }))
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Anything else you’d like us to know?"
                      />
                    </div>
                  )}
                    {fieldErrors.topics && (
                      <p className="mt-2 text-sm text-rose-500">{fieldErrors.topics}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">
                      How would you like to participate?
                    </label>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {PARTICIPATION_OPTIONS.map(option => {
                        const isActive = form.participationStyle === option
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => selectParticipation(option)}
                            className={`rounded-2xl border px-4 py-3 text-left text-sm transition-all ${
                              isActive
                                ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow'
                            }`}
                          >
                            <span className="font-medium text-slate-800">{option}</span>
                          </button>
                        )
                      })}
                    </div>
                    {fieldErrors.participationStyle && (
                      <p className="mt-2 text-sm text-rose-500">{fieldErrors.participationStyle}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">
                      When do you prefer to chat?
                    </label>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {AVAILABILITY_OPTIONS.map(option => {
                        const isActive = form.availability === option
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => selectAvailability(option)}
                            className={`rounded-xl border px-4 py-2 text-sm transition-all ${
                              isActive
                                ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-indigo-200 hover:text-indigo-600'
                            }`}
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>
                    {fieldErrors.availability && (
                      <p className="mt-2 text-sm text-rose-500">{fieldErrors.availability}</p>
                    )}
                  </div>
                </div>
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.3 }}
                className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Wellbeing check-in</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Think about the past 2 weeks when you answer these.
                    </p>
                  </div>
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                    PHQ-2 + GAD-2
                  </span>
                </div>

                <div className="mt-6 space-y-6">
                  {WELLBEING_QUESTIONS.map(question => {
                    const currentValue = form.wellbeing[question.key]
                    return (
                      <div
                        key={question.key}
                        className="rounded-xl border border-slate-200/70 bg-white px-4 py-4 shadow-sm"
                      >
                        <fieldset>
                          <legend className="text-sm font-medium text-slate-800">
                            {question.label}
                          </legend>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {WELLBEING_SCALE.map(option => {
                              const isSelected = currentValue === option.value
                              return (
                                <label
                                  key={option.value}
                                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all ${
                                    isSelected
                                      ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
                                      : 'border-slate-200 hover:border-indigo-200 hover:shadow'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={question.key}
                                    value={option.value}
                                    checked={isSelected}
                                    onChange={() => selectWellbeing(question.key, option.value)}
                                    className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span className="flex flex-col">
                                    <span className="font-medium text-slate-800">{option.label}</span>
                                    <span className="text-xs text-slate-500">{option.hint}</span>
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        </fieldset>
                        {fieldErrors[`wellbeing.${question.key}`] && (
                          <p className="mt-2 text-sm text-rose-500">
                            {fieldErrors[`wellbeing.${question.key}`]}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.3 }}
                className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur"
              >
                <h2 className="text-lg font-semibold text-slate-900">Safety & consent</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Peer support ≠ therapy. If you’re in immediate danger, use emergency services.
                </p>

                <div className="mt-6 space-y-4">
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                    <input
                      type="checkbox"
                      checked={form.consentAccepted}
                      onChange={event => {
                        const checked = event.target.checked
                        setHasHydrated(true)
                        setForm(prev => ({ ...prev, consentAccepted: checked }))
                        setFieldErrors(prev => {
                          if (!prev.consent) return prev
                          const next = { ...prev }
                          if (checked) {
                            delete next.consent
                          }
                          return next
                        })
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      This is a peer-support space (not therapy). Moderators may review flagged content to
                      keep everyone safe. I agree to the community guidelines and understand how my
                      information is used.{' '}
                      <button
                        type="button"
                        onClick={() => setShowGuidelines(true)}
                        className="font-semibold text-indigo-600 underline-offset-4 hover:underline"
                      >
                        View guidelines
                      </button>
                    </span>
                  </label>
                  {fieldErrors.consent && (
                    <p className="text-sm text-rose-500">{fieldErrors.consent}</p>
                  )}

                  <label className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                    <span>If we’re concerned about safety, it’s okay to email me resources.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setHasHydrated(true)
                        setForm(prev => ({ ...prev, contactOk: !prev.contactOk }))
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                        form.contactOk ? 'bg-indigo-500' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                          form.contactOk ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </motion.section>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.3 }}
                className="sticky bottom-0 left-0 right-0 -mx-4 border-t border-slate-200/80 bg-white/90 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
              >
                <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Progress saves automatically. You can come back anytime.
                  </p>
                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={!isFormComplete || isSubmitting}
                      className="inline-flex min-w-[150px] items-center justify-center rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300 disabled:hover:scale-100"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Finishing...
                        </span>
                      ) : (
                        'Finish setup'
                      )}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.form>
            </motion.div>
          )}

          {view === 'success' && serverResult && user && (
            <motion.section
              key="success-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50 p-10 text-center shadow-xl backdrop-blur"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 18 }}
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xl"
              >
                <motion.svg
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.5, duration: 0.5, ease: 'easeOut' }}
                  className="h-10 w-10 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <motion.path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </motion.svg>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <h2 className="mt-6 text-3xl font-bold text-emerald-900">
                  Welcome to MindBridge, {user.fullName.split(' ')[0]}!
                </h2>
                <p className="mt-3 text-base text-emerald-800">
                  You've taken an important step toward feeling better
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mx-auto mt-8 max-w-md rounded-xl bg-white/60 p-6 shadow-sm backdrop-blur"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-slate-900">You've been matched to a support circle</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      Based on what you shared, we've connected you with a small group of peers who understand what you're going through. Your circle has a trained moderator to guide discussions and ensure a safe, supportive space.
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="mx-auto mt-6 max-w-md rounded-xl bg-white/60 p-6 shadow-sm backdrop-blur"
              >
                <h3 className="text-sm font-semibold text-slate-900">What to expect next</h3>
                <div className="mt-4 space-y-3 text-left text-sm text-slate-700">
                  <div className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="10" opacity="0.2" />
                      <path d="M9 12l2 2 4-4" stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Check your email for a welcome message with circle details</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="10" opacity="0.2" />
                      <path d="M9 12l2 2 4-4" stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Join your circle in the Chat section whenever you're ready</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="10" opacity="0.2" />
                      <path d="M9 12l2 2 4-4" stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Use Instant Help anytime for 24/7 AI-powered support</span>
                  </div>
                </div>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="mt-6 text-sm italic text-emerald-700"
              >
                Remember: Your wellbeing matters, and you don't have to do this alone
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="mt-8"
              >
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={() => handleNavigate('/dashboard')}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-4 text-base font-semibold text-white shadow-xl transition hover:from-emerald-700 hover:to-teal-700 hover:shadow-2xl"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Go to Dashboard
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </motion.button>
              </motion.div>
            </motion.section>
          )}

          {view === 'high' && serverResult && (
            <motion.section
              key="high-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="rounded-2xl border border-indigo-200/80 bg-white/90 p-8 shadow-lg backdrop-blur"
            >
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 18 }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500 shadow-lg"
              >
                <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-6 text-2xl font-semibold text-slate-900"
              >
                Thank you for trusting us with this
              </motion.h2>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700"
              >
                <p>
                  We see that you're going through a difficult time right now. It takes courage to reach out,
                  and we want you to know that you don't have to face this alone.
                </p>
                <p>
                  While we work on finding the best support for you, we've connected your information with our
                  care team. In the meantime, there are people ready to listen and help, day or night.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-left shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <div>
                    <h3 className="text-base font-semibold text-rose-900">Help is available right now</h3>
                    <p className="mt-1 text-sm text-rose-800">
                      These confidential helplines are available 24/7 to support you:
                    </p>
                  </div>
                </div>
                <div className="mt-5 space-y-4 text-sm">
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="font-semibold text-rose-900">India - Kiran Mental Health Helpline</p>
                    <p className="mt-1 text-2xl font-bold text-rose-700">1800-599-0019</p>
                    <p className="mt-1 text-xs text-rose-600">Available 24×7, toll-free</p>
                  </div>
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="font-semibold text-rose-900">Worldwide Resources</p>
                    <a
                      href="https://www.befrienders.org"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 underline-offset-4 hover:underline"
                    >
                      befrienders.org
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                    <p className="mt-1 text-xs text-slate-600">Find crisis helplines in your country</p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-rose-100 p-3">
                  <p className="text-xs font-medium text-rose-900">
                    If you're experiencing a medical emergency or are in immediate danger, please contact local emergency services or go to your nearest hospital.
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65 }}
                className="mt-6 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 p-5 text-left"
              >
                <h4 className="text-sm font-semibold text-slate-900">What happens next?</h4>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="10" opacity="0.2" />
                      <path d="M9 12l2 2 4-4" stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Our care team has been notified and will review your information</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="10" opacity="0.2" />
                      <path d="M9 12l2 2 4-4" stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Someone may reach out to you directly (if you gave permission)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="10" opacity="0.2" />
                      <path d="M9 12l2 2 4-4" stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>You can still use our Instant Help companion while we connect you with additional support</span>
                  </li>
                </ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.75 }}
                className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"
              >
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={() => handleNavigate('/dashboard')}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-700 hover:shadow-xl"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Go to Instant Help
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={() => handleNavigate('/')}
                  className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  Return Home
                </motion.button>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.85 }}
                className="mt-6 text-center text-xs italic text-slate-500"
              >
                You matter, and your wellbeing is important to us. We're here for you.
              </motion.p>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showGuidelines && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowGuidelines(false)}
            className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Community guidelines</h3>
                <button
                  type="button"
                  onClick={() => setShowGuidelines(false)}
                  className="text-slate-500 hover:text-slate-700"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p>• Keep conversations compassionate and non-judgmental.</p>
                <p>• Respect confidentiality—never share details outside your circle.</p>
                <p>• Flag anything that feels unsafe; moderators are here to help.</p>
                <p>• Peer support complements professional care, it doesn’t replace it.</p>
              </div>
              <div className="mt-6 text-right">
                <button
                  type="button"
                  onClick={() => setShowGuidelines(false)}
                  className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
