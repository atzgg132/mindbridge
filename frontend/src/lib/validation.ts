import type { PasswordStrength } from '../types'

export const validatePasswordStrength = (password: string): PasswordStrength => {
  if (!password) {
    return {
      score: 0,
      feedback: 'Password is required',
      isValid: false,
    }
  }

  if (password.length < 8) {
    return {
      score: 1,
      feedback: 'Password must be at least 8 characters long',
      isValid: false,
    }
  }

  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[!@#$%^&*]/.test(password)

  if (!hasUpper) {
    return {
      score: 2,
      feedback: 'Password must contain at least one uppercase letter',
      isValid: false,
    }
  }

  if (!hasLower) {
    return {
      score: 2,
      feedback: 'Password must contain at least one lowercase letter',
      isValid: false,
    }
  }

  if (!hasNumber) {
    return {
      score: 3,
      feedback: 'Password must contain at least one number',
      isValid: false,
    }
  }

  if (!hasSpecial) {
    return {
      score: 3,
      feedback: 'Password must contain at least one special character (!@#$%^&*)',
      isValid: false,
    }
  }

  // All checks passed
  return {
    score: 4,
    feedback: 'Strong password',
    isValid: true,
  }
}

export const getPasswordStrengthColor = (score: number): string => {
  switch (score) {
    case 1:
      return 'bg-red-500'
    case 2:
      return 'bg-orange-500'
    case 3:
      return 'bg-yellow-500'
    case 4:
      return 'bg-green-500'
    default:
      return 'bg-gray-300'
  }
}

export const getPasswordStrengthText = (score: number): string => {
  switch (score) {
    case 1:
      return 'Very Weak'
    case 2:
      return 'Weak'
    case 3:
      return 'Fair'
    case 4:
      return 'Strong'
    default:
      return ''
  }
}
