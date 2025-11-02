import api from '../lib/api'
import type { SignupData, SigninData, AuthResponse, User } from '../types'

export const authApi = {
  signup: async (data: Omit<SignupData, 'confirmPassword'>): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/signup', data)
    return response.data
  },

  signin: async (data: SigninData): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/signin', data)
    return response.data
  },

  checkEmail: async (email: string): Promise<{ available: boolean; email: string }> => {
    const response = await api.get(`/auth/check-email?email=${encodeURIComponent(email)}`)
    return response.data
  },

  checkPhoneNumber: async (phoneNumber: string): Promise<{ available: boolean; phoneNumber: string }> => {
    const response = await api.get(`/auth/check-phone-number?phoneNumber=${encodeURIComponent(phoneNumber)}`)
    return response.data
  },

  getMe: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me')
    return response.data
  },
}
