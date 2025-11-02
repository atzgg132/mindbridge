import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { authApi } from '../api/auth'
import { validatePasswordStrength, getPasswordStrengthColor, getPasswordStrengthText } from '../lib/validation'
import { fileToBase64, getInitials, generateColorFromName } from '../lib/avatar'
import { countries } from '../lib/countries'
import type { SignupData } from '../types'

export default function Signup() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState<SignupData>({
    fullName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  })

  const [profilePicturePreview, setProfilePicturePreview] = useState<string>('')
  const [errors, setErrors] = useState<Partial<Record<keyof SignupData, string>>>({})
  const [emailCheckStatus, setEmailCheckStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [phoneCheckStatus, setPhoneCheckStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [countryCode, setCountryCode] = useState('+91')
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)

  const passwordStrength = validatePasswordStrength(formData.password)
  const passwordRules = useMemo(
    () => [
      { label: 'At least 8 characters', isValid: formData.password.length >= 8 },
      { label: 'One lowercase letter', isValid: /[a-z]/.test(formData.password) },
      { label: 'One uppercase letter', isValid: /[A-Z]/.test(formData.password) },
      { label: 'One number', isValid: /[0-9]/.test(formData.password) },
      { label: 'One symbol (!@#$%^&*)', isValid: /[!@#$%^&*]/.test(formData.password) },
    ],
    [formData.password]
  )
  const satisfiedPasswordRules = useMemo(
    () => passwordRules.filter(rule => rule.isValid).length,
    [passwordRules]
  )

  // Debounced email check
  useEffect(() => {
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setEmailCheckStatus('idle')
      return
    }

    setEmailCheckStatus('checking')
    const timeoutId = setTimeout(async () => {
      try {
        const result = await authApi.checkEmail(formData.email)
        setEmailCheckStatus(result.available ? 'available' : 'taken')
        if (!result.available) {
          setErrors(prev => ({ ...prev, email: 'Email already registered' }))
        } else {
          setErrors(prev => ({ ...prev, email: undefined }))
        }
      } catch (error) {
        setEmailCheckStatus('idle')
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [formData.email])

  // Debounced phone number check
  useEffect(() => {
    if (!formData.phoneNumber || formData.phoneNumber.length !== 10) {
      setPhoneCheckStatus('idle')
      return
    }

    setPhoneCheckStatus('checking')
    const timeoutId = setTimeout(async () => {
      try {
        // Combine country code with phone number for checking
        const fullPhoneNumber = `${countryCode}${formData.phoneNumber}`
        const result = await authApi.checkPhoneNumber(fullPhoneNumber)
        setPhoneCheckStatus(result.available ? 'available' : 'taken')
        if (!result.available) {
          setErrors(prev => ({ ...prev, phoneNumber: 'Phone number already registered' }))
        } else {
          setErrors(prev => ({ ...prev, phoneNumber: undefined }))
        }
      } catch (error) {
        setPhoneCheckStatus('idle')
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [formData.phoneNumber, countryCode])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    let nextValue = value

    // For phone number, only allow digits
    if (name === 'phoneNumber') {
      const digitsOnly = value.replace(/\D/g, '')
      nextValue = digitsOnly
    }

    setFormData(prev => ({ ...prev, [name]: nextValue }))

    // Clear error when user starts typing
    if (errors[name as keyof SignupData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }))
    }

    // Validate confirm password on change
    if (name === 'confirmPassword' && nextValue !== formData.password) {
      setErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }))
    } else if (name === 'confirmPassword' && nextValue === formData.password) {
      setErrors(prev => ({ ...prev, confirmPassword: undefined }))
    }

    if (name === 'password' && formData.confirmPassword) {
      setErrors(prev => ({
        ...prev,
        confirmPassword: nextValue === formData.confirmPassword ? undefined : 'Passwords do not match',
      }))
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB')
      return
    }

    try {
      const base64 = await fileToBase64(file)
      setProfilePicturePreview(base64)
      setFormData(prev => ({ ...prev, profilePicture: base64 }))
    } catch (error) {
      console.error('Error converting file:', error)
      alert('Failed to process image')
    }
  }

  const removeProfilePicture = () => {
    setProfilePicturePreview('')
    setFormData(prev => ({ ...prev, profilePicture: undefined }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const validatePhoneNumber = () => {
    if (!formData.phoneNumber.trim()) {
      setErrors(prev => ({ ...prev, phoneNumber: 'Phone number is required' }))
    } else if (!/^[0-9]{10}$/.test(formData.phoneNumber)) {
      setErrors(prev => ({ ...prev, phoneNumber: 'Phone number must be exactly 10 digits' }))
    } else {
      setErrors(prev => ({ ...prev, phoneNumber: undefined }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof SignupData, string>> = {}

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required'
    } else if (!/^[0-9]{10}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = 'Phone number must be exactly 10 digits'
    }

    if (!passwordStrength.isValid) {
      newErrors.password = passwordStrength.feedback
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    // Check profile picture size if provided
    if (formData.profilePicture && profilePicturePreview) {
      // Base64 string size is approximately 1.37x the actual file size
      const base64Size = formData.profilePicture.length * 0.75 // Convert back to bytes
      if (base64Size > 5 * 1024 * 1024) {
        alert('Profile picture must be less than 5MB')
        return false
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm() || emailCheckStatus !== 'available' || phoneCheckStatus !== 'available') {
      return
    }

    setIsSubmitting(true)

    try {
      const { confirmPassword, ...signupData } = formData
      // Combine country code with phone number
      const dataToSubmit = {
        ...signupData,
        phoneNumber: `${countryCode}${formData.phoneNumber}`
      }
      const response = await authApi.signup(dataToSubmit)
      setAuth(response.user, response.token)
      navigate(response.user.onboardingCompleted ? '/dashboard' : '/onboarding')
    } catch (error: any) {
      setErrors({
        email: error.response?.data?.error || 'Signup failed. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-4"
          >
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Join MindBridge</h1>
            <p className="text-sm text-gray-600">Create your account to get started</p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Profile Picture & Full Name */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center gap-3">
                {/* Profile Picture */}
                <div className="flex-shrink-0">
                  <div className="relative group">
                    {profilePicturePreview ? (
                      <>
                        <img
                          src={profilePicturePreview}
                          alt="Profile preview"
                          className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => fileInputRef.current?.click()}
                        />
                        <button
                          type="button"
                          onClick={removeProfilePicture}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors z-10"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <div
                        className={`w-16 h-16 rounded-full ${generateColorFromName(formData.fullName || 'User')} flex items-center justify-center text-white text-lg font-semibold border-2 border-gray-200 cursor-pointer hover:opacity-80 transition-opacity`}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {getInitials(formData.fullName || 'User')}
                      </div>
                    )}
                    {/* Pencil Edit Icon */}
                    <div
                      className="absolute bottom-0 right-0 bg-indigo-600 text-white rounded-full p-1 cursor-pointer hover:bg-indigo-700 transition-colors shadow-md"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="profile-picture"
                  />
                </div>
                {/* Name Field */}
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 text-sm rounded-lg border ${
                      errors.fullName ? 'border-red-500' : 'border-gray-300'
                    } focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200`}
                    placeholder="John Doe"
                  />
                  <AnimatePresence>
                    {errors.fullName && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-red-500 text-sm mt-1"
                      >
                        {errors.fullName}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            {/* Email */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.37 }}
            >
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Email
              </label>
              <div className="relative">
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 text-sm rounded-lg border ${
                    errors.email
                      ? 'border-red-500'
                      : emailCheckStatus === 'available'
                      ? 'border-green-500'
                      : 'border-gray-300'
                  } focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200`}
                  placeholder="john@example.com"
                />
                {emailCheckStatus === 'checking' && (
                  <div className="absolute right-3 top-3">
                    <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
                  </div>
                )}
                {emailCheckStatus === 'available' && (
                  <div className="absolute right-3 top-3 text-green-500">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                {emailCheckStatus === 'taken' && (
                  <div className="absolute right-3 top-3 text-red-500">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
              <AnimatePresence>
                {errors.email && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-red-500 text-sm mt-1"
                  >
                    {errors.email}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Phone Number */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 }}
            >
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="px-2 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-white"
                  style={{ width: '90px' }}
                >
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.flag} {country.code}
                    </option>
                  ))}
                </select>
                <div className="flex-1 relative">
                  <input
                    type="tel"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    onBlur={validatePhoneNumber}
                    maxLength={10}
                    className={`w-full px-3 py-2 text-sm rounded-lg border ${
                      errors.phoneNumber
                        ? 'border-red-500'
                        : phoneCheckStatus === 'available'
                        ? 'border-green-500'
                        : 'border-gray-300'
                    } focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200`}
                    placeholder="1234567890"
                  />
                  {phoneCheckStatus === 'checking' && (
                    <div className="absolute right-3 top-3">
                      <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
                    </div>
                  )}
                  {phoneCheckStatus === 'available' && (
                    <div className="absolute right-3 top-3 text-green-500">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  {phoneCheckStatus === 'taken' && (
                    <div className="absolute right-3 top-3 text-red-500">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
              <AnimatePresence>
                {errors.phoneNumber && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-red-500 text-sm mt-1"
                  >
                    {errors.phoneNumber}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Password */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.45 }}
            >
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  className={`w-full px-4 py-2.5 pr-10 rounded-lg border ${
                    errors.password ? 'border-red-500' : 'border-gray-300'
                  } focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  onMouseDown={(event) => event.preventDefault()}
                  className="absolute right-3 top-3 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <AnimatePresence>
                {isPasswordFocused && (
                  <motion.div
                    key="password-helper"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50 p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-white overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(satisfiedPasswordRules / passwordRules.length) * 100}%` }}
                          transition={{ duration: 0.3 }}
                          className={`h-full ${getPasswordStrengthColor(passwordStrength.score)} transition-all duration-300`}
                        />
                      </div>
                      <span className="text-xs font-medium text-indigo-700 min-w-16">
                        {getPasswordStrengthText(passwordStrength.score) || 'Start typing'}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {passwordRules.map(rule => (
                        <li key={rule.label} className="flex items-center gap-2">
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                              rule.isValid ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 text-gray-400 bg-white'
                            }`}
                          >
                            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                              {rule.isValid ? (
                                <path d="M2 6l2.5 2.5L10 3" strokeLinecap="round" strokeLinejoin="round" />
                              ) : (
                                <path d="M3 3l6 6m0-6l-6 6" strokeLinecap="round" />
                              )}
                            </svg>
                          </span>
                          <span className={`text-xs ${rule.isValid ? 'text-gray-800' : 'text-gray-600'}`}>
                            {rule.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {errors.password && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-red-500 text-sm mt-1"
                  >
                    {errors.password}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Confirm Password */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
            >
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`w-full px-4 py-2.5 pr-10 rounded-lg border ${
                    errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                  } focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <AnimatePresence>
                {errors.confirmPassword && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-red-500 text-sm mt-1"
                  >
                    {errors.confirmPassword}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Submit Button */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              type="submit"
              disabled={isSubmitting || emailCheckStatus !== 'available' || phoneCheckStatus !== 'available'}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 rounded-lg font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl text-sm"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Creating...
                </span>
              ) : (
                'Create Account'
              )}
            </motion.button>
          </form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4 text-center"
          >
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link
                to="/signin"
                className="text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
              >
                Sign In
              </Link>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
