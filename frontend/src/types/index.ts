export type UserRole = 'USER' | 'MODERATOR'

export interface User {
  id: string
  email: string
  fullName: string
  phoneNumber: string
  profilePicture?: string
  role: UserRole
  onboardingCompleted: boolean
  createdAt?: string
  updatedAt?: string
}

export interface SignupData {
  fullName: string
  email: string
  phoneNumber: string
  password: string
  confirmPassword: string
  profilePicture?: string
}

export interface SigninData {
  email: string
  password: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface ApiResponse<T> {
  success?: boolean
  data?: T
  message?: string
  error?: string
}

export interface PasswordStrength {
  score: number
  feedback: string
  isValid: boolean
}

export type ScreeningResultBand = 'low' | 'medium' | 'high'

export interface WellbeingAnswers {
  littleInterest: number | null
  feelingDown: number | null
  feelingNervous: number | null
  worrying: number | null
}

export interface PersistedWellbeingAnswers {
  littleInterest: number
  feelingDown: number
  feelingNervous: number
  worrying: number
}

export interface OnboardingSubmission {
  topics: string[]
  otherTopic: string
  participationStyle: string
  availability: string
  wellbeing: PersistedWellbeingAnswers
  consentAccepted: boolean
  consentVersion: string
  contactOk: boolean
}

export interface OnboardingData {
  topics: string[]
  otherTopic?: string
  participationStyle: string
  availability: string
  wellbeing: PersistedWellbeingAnswers
  phq2Total: number
  gad2Total: number
  screeningResult: ScreeningResultBand
  consentVersion: string
  contactOk: boolean
  onboardingDone: boolean
}
